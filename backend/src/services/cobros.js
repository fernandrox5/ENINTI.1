// Cobros en línea con Flow. El cobro es mensual (o según la frecuencia del plan) el mismo día del
// contrato, como una suscripción de streaming:
//   - con tarjeta inscrita: se cobra solo; si falla se reintenta un día después (configuracion.reintentos_cobro)
//   - sin tarjeta: se crea un enlace de pago (transferencia, Webpay, etc.) que el cliente ve en el portal
//   - si no se paga dentro del plazo, la suscripción se cierra con motivo "Falta de pago"
// Cuando Flow confirma el pago, el cobro crea los pagos de sus periodos (estado "pagado").
import { pool } from '../config/db.js';
import * as flow from './flow.js';
import { ESTADO_FLOW } from './flow.js';
import { PRODUCCION, urlApp } from './invitaciones.js';
import { ErrorHttp } from '../utils/validar.js';

const DESARROLLO = 'https://syntia-git-develop-fernandos-projects-7f551f0e.vercel.app';
const DIAS_ENLACE = 7;

// Sin deuda acumulada: si el periodo no se paga dentro del plazo (configuracion.dias_plazo_pago,
// 7 por defecto) la suscripción se cierra sola por falta de pago. Nunca se cobran meses atrás.
export async function plazoPago(db = pool) {
  const { rows: [r] } = await db.query("SELECT (SELECT valor FROM configuracion WHERE clave = 'dias_plazo_pago') AS valor");
  return Number(r?.valor) > 0 ? Number(r.valor) : 7;
}

// Flow solo puede avisar a una URL pública: en local se usa la de desarrollo (misma base de datos)
export function basePublica(req) {
  if (process.env.FLOW_URL_PUBLICA) return process.env.FLOW_URL_PUBLICA.replace(/\/$/, '');
  const base = req ? urlApp(req) : process.env.VERCEL_ENV === 'production' ? PRODUCCION : DESARROLLO;
  return base.startsWith('http://localhost') ? DESARROLLO : base;
}
const urlConfirmacion = (req) => `${basePublica(req)}/api/flow/confirmacion`;

// Periodos sin pagar de una suscripción (con su fecha de inicio real); "vencido" = ya corresponde cobrarlo
export async function periodosSinPagar(suscripcionId, db = pool) {
  const { rows } = await db.query(
    `SELECT g.inicio::date::text AS inicio, date_trunc('month', g.inicio)::date AS periodo, g.inicio::date <= fn_hoy() AS vencido
     FROM suscripciones s
     CROSS JOIN LATERAL generate_series(
       (s.fecha_inicio + make_interval(months => s.meses_gratis))::timestamp,
       (coalesce(s.fecha_cierre, s.fecha_termino) - 1)::timestamp,
       make_interval(months => fn_meses_periodo(s.frecuencia_pago))) g(inicio)
     WHERE s.id = $1
       AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.suscripcion_id = s.id AND p.estado IN ('pagado', 'pendiente')
                       AND p.periodo = date_trunc('month', g.inicio)::date)
     ORDER BY g.inicio`, [suscripcionId]);
  return rows;
}

const nombreMes = (periodo) => new Date(`${periodo}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
const asunto = (s, periodo, n) => `ENINTI ${s.codigo} · ${n > 1 ? `${n} periodos desde ${nombreMes(periodo)}` : nombreMes(periodo)}`;
const orden = (suscripcionId, periodo, sufijo) => `SYN-${suscripcionId}-${periodo.slice(0, 7).replace('-', '')}-${sufijo}`;

// Medio de pago de Syntia según lo que informa Flow
function medioDesdeFlow(canal, media = '') {
  if (canal === 'tarjeta') return 'tarjeta';
  if (/transfer|khipu|servipag|banco|etpay/i.test(media)) return 'transferencia';
  if (/webpay|tarjeta|credit|debit|onepay|mach|cuenta rut/i.test(media)) return 'tarjeta';
  return 'otro';
}

// Aplica la respuesta de Flow a un cobro (idempotente: si ya estaba pagado no hace nada)
export async function aplicarResultado(cobroId, respuesta) {
  const estado = ESTADO_FLOW[respuesta?.status] ?? 'pendiente';
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [c] } = await db.query('SELECT * FROM cobros WHERE id = $1 FOR UPDATE', [cobroId]);
    if (!c || c.estado === 'pagado' || estado === 'pendiente') { await db.query('ROLLBACK'); return c?.estado ?? null; }
    const media = respuesta.paymentData?.media ?? null;
    const error = estado === 'pagado' ? null : respuesta.lastError?.message || respuesta.lastError?.code || (estado === 'rechazado' ? 'Pago rechazado' : 'Pago anulado');
    await db.query('UPDATE cobros SET estado = $2, flow_order = COALESCE($3, flow_order), medio_flow = COALESCE($4, medio_flow), error = $5 WHERE id = $1',
      [c.id, estado, respuesta.flowOrder ?? null, media, error]);
    if (estado === 'pagado') {
      // Un pago por periodo cubierto, desde el primero del cobro
      const periodos = (await periodosSinPagar(c.suscripcion_id, db)).filter((p) => p.periodo >= c.periodo).slice(0, c.cantidad_periodos);
      const montoPeriodo = Math.round(c.monto / c.cantidad_periodos);
      const fecha = respuesta.paymentData?.date ? new Date(respuesta.paymentData.date) : new Date();
      for (const p of periodos) {
        await db.query(
          `INSERT INTO pagos (suscripcion_id, periodo, monto, fecha_pago, medio_pago, estado, referencia_externa, cobro_id, observaciones)
           VALUES ($1, $2, $3, $4, $5, 'pagado', $6, $7, $8) ON CONFLICT DO NOTHING`,
          [c.suscripcion_id, p.periodo, montoPeriodo, Number.isNaN(fecha.getTime()) ? new Date() : fecha, medioDesdeFlow(c.canal, media),
           String(respuesta.flowOrder ?? c.commerce_order), c.id, `Pagado en línea con Flow${media ? ` (${media})` : ''}`]);
      }
    }
    await db.query('COMMIT');
    return estado;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

// Consulta en Flow el estado de un cobro pendiente y lo aplica
export async function actualizarCobro(c) {
  if (c.estado !== 'pendiente') return c.estado;
  const r = c.flow_token ? await flow.estadoPago(c.flow_token) : await flow.estadoPorOrden(c.commerce_order);
  return aplicarResultado(c.id, r);
}

// Cliente de Flow (se crea la primera vez)
export async function clienteFlow(clienteId, db = pool) {
  const { rows: [c] } = await db.query('SELECT id, nombre, email, flow_customer_id FROM clientes WHERE id = $1', [clienteId]);
  if (!c) throw new ErrorHttp(404, 'Cliente no encontrado');
  if (c.flow_customer_id) return c;
  if (!c.email) throw new ErrorHttp(400, 'El cliente necesita un correo para pagar en línea');
  const r = await flow.crearCliente({ nombre: c.nombre.replace(/\[[^\]]*\]\s*/g, ''), email: c.email, externalId: `cliente-${c.id}` });
  await db.query('UPDATE clientes SET flow_customer_id = $2 WHERE id = $1', [c.id, r.customerId]);
  return { ...c, flow_customer_id: r.customerId };
}

// Datos de la suscripción para cobrar
async function datosSuscripcion(suscripcionId) {
  const { rows: [s] } = await pool.query(
    `SELECT s.id, s.codigo, s.estado, s.monto_pactado, c.id AS cliente_id, c.email, c.flow_customer_id,
            t.id AS tarjeta_id
     FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN tarjetas t ON t.cliente_id = c.id AND t.estado = 'activa'
     WHERE s.id = $1`, [suscripcionId]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada');
  return s;
}

// Enlace de pago por N periodos (lo pide el cliente en el portal, el admin o el proceso automático)
export async function crearEnlacePago(req, suscripcionId, { cantidad = 1, origen = 'cliente', perfilId = null } = {}) {
  const s = await datosSuscripcion(suscripcionId);
  if (s.estado !== 'vigente') throw new ErrorHttp(409, 'La suscripción no está vigente');
  if (!s.email) throw new ErrorHttp(400, 'El cliente necesita un correo para pagar en línea');
  const pendientes = await periodosSinPagar(s.id);
  if (!pendientes.length) throw new ErrorHttp(409, 'No hay periodos por pagar en esta suscripción');
  const n = Math.min(Math.max(1, Number(cantidad) || 1), pendientes.length);
  const periodo = pendientes[0].periodo;
  // Si ya hay un enlace vigente para ese periodo y la misma cantidad, se reutiliza
  const { rows: [previo] } = await pool.query(
    "SELECT * FROM cobros WHERE suscripcion_id = $1 AND periodo = $2 AND estado = 'pendiente'", [s.id, periodo]);
  if (previo) {
    const estado = await actualizarCobro(previo).catch(() => 'pendiente');
    const reciente = Date.now() - new Date(previo.created_at).getTime() < (DIAS_ENLACE - 1) * 864e5;
    if (estado === 'pendiente' && previo.canal === 'enlace' && previo.cantidad_periodos === n && reciente && previo.url_pago) return previo;
    if (estado === 'pendiente') await pool.query("UPDATE cobros SET estado = 'expirado', error = 'Reemplazado por un enlace nuevo' WHERE id = $1", [previo.id]);
    if (estado === 'pagado') throw new ErrorHttp(409, 'Ese periodo ya se pagó');
  }
  const monto = s.monto_pactado * n;
  const { rows: [{ total }] } = await pool.query('SELECT count(*)::int AS total FROM cobros WHERE suscripcion_id = $1 AND periodo = $2', [s.id, periodo]);
  const commerceOrder = orden(s.id, periodo, `E${total + 1}`);
  const { rows: [c] } = await pool.query(
    `INSERT INTO cobros (suscripcion_id, periodo, cantidad_periodos, monto, canal, origen, intento, commerce_order, creado_por)
     VALUES ($1, $2, $3, $4, 'enlace', $5, $6, $7, $8) RETURNING *`,
    [s.id, periodo, n, monto, origen, total + 1, commerceOrder, perfilId]);
  try {
    const base = req ? urlApp(req) : basePublica(null);
    const r = await flow.crearEnlace({
      orden: commerceOrder, asunto: asunto(s, periodo, n), monto, email: s.email,
      urlConfirmacion: urlConfirmacion(req), urlRetorno: `${base}/api/flow/retorno?app=${encodeURIComponent(base)}`,
    });
    const url = `${r.url}?token=${r.token}`;
    const { rows: [act] } = await pool.query('UPDATE cobros SET flow_token = $2, flow_order = $3, url_pago = $4 WHERE id = $1 RETURNING *', [c.id, r.token, r.flowOrder, url]);
    return act;
  } catch (err) {
    await pool.query("UPDATE cobros SET estado = 'anulado', error = $2 WHERE id = $1", [c.id, err.message]);
    throw err;
  }
}

// Cobro inmediato a la tarjeta inscrita del primer periodo vencido
export async function cobrarConTarjeta(suscripcionId, { origen = 'automatico', perfilId = null } = {}) {
  const s = await datosSuscripcion(suscripcionId);
  if (s.estado !== 'vigente') throw new ErrorHttp(409, 'La suscripción no está vigente');
  if (!s.tarjeta_id || !s.flow_customer_id) throw new ErrorHttp(409, 'El cliente no tiene una tarjeta inscrita');
  const vencido = (await periodosSinPagar(s.id)).find((p) => p.vencido);
  if (!vencido) throw new ErrorHttp(409, 'No hay periodos vencidos por cobrar');
  const { rows: [pend] } = await pool.query("SELECT * FROM cobros WHERE suscripcion_id = $1 AND periodo = $2 AND estado = 'pendiente'", [s.id, vencido.periodo]);
  if (pend) {
    const estado = await actualizarCobro(pend).catch(() => 'pendiente');
    if (estado === 'pendiente' && pend.canal === 'tarjeta') throw new ErrorHttp(409, 'Ya hay un cobro en proceso para ese periodo');
    if (estado === 'pendiente') await pool.query("UPDATE cobros SET estado = 'expirado', error = 'Se cobró con la tarjeta inscrita' WHERE id = $1", [pend.id]);
    if (estado === 'pagado') return { estado: 'pagado' };
  }
  const { rows: [{ total }] } = await pool.query('SELECT count(*)::int AS total FROM cobros WHERE suscripcion_id = $1 AND periodo = $2', [s.id, vencido.periodo]);
  const { rows: [{ intentos }] } = await pool.query(
    "SELECT count(*)::int AS intentos FROM cobros WHERE suscripcion_id = $1 AND periodo = $2 AND canal = 'tarjeta'", [s.id, vencido.periodo]);
  const commerceOrder = orden(s.id, vencido.periodo, `T${total + 1}`);
  const { rows: [c] } = await pool.query(
    `INSERT INTO cobros (suscripcion_id, periodo, monto, canal, origen, intento, commerce_order, creado_por)
     VALUES ($1, $2, $3, 'tarjeta', $4, $5, $6, $7) RETURNING *`,
    [s.id, vencido.periodo, s.monto_pactado, origen, intentos + 1, commerceOrder, perfilId]);
  try {
    const r = await flow.cobrarTarjeta({ customerId: s.flow_customer_id, monto: s.monto_pactado, asunto: asunto(s, vencido.periodo, 1), orden: commerceOrder });
    const estado = (await aplicarResultado(c.id, r)) ?? 'pendiente';
    if (estado === 'pendiente') await pool.query('UPDATE cobros SET flow_order = $2 WHERE id = $1', [c.id, r.flowOrder ?? null]);
    return { cobro_id: c.id, estado };
  } catch (err) {
    await pool.query("UPDATE cobros SET estado = 'rechazado', error = $2 WHERE id = $1", [c.id, err.message]);
    return { cobro_id: c.id, estado: 'rechazado', error: err.message };
  }
}

// Suscripciones vigentes con un periodo vencido sin pagar y qué se haría con cada una
export async function cobrosDelDia() {
  const { rows: [{ valor }] } = await pool.query("SELECT coalesce((SELECT valor FROM configuracion WHERE clave = 'reintentos_cobro'), '3') AS valor");
  const maxIntentos = Number(valor) || 3;
  const { rows } = await pool.query(
    `SELECT s.id, s.codigo, s.monto_pactado, c.id AS cliente_id, c.nombre AS cliente, c.email, c.telefono,
            i.id AS instalacion_id, coalesce(i.nombre, i.codigo) AS instalacion,
            t.id AS tarjeta_id, t.tipo AS tarjeta_tipo, t.ultimos4, p.periodo, p.inicio,
            (SELECT count(*)::int FROM cobros k WHERE k.suscripcion_id = s.id AND k.periodo = p.periodo AND k.canal = 'tarjeta') AS intentos,
            (SELECT max(k.created_at)::date = fn_hoy() FROM cobros k WHERE k.suscripcion_id = s.id AND k.periodo = p.periodo AND k.canal = 'tarjeta') AS intento_hoy,
            (SELECT row_to_json(k) FROM cobros k WHERE k.suscripcion_id = s.id AND k.periodo = p.periodo AND k.estado = 'pendiente' LIMIT 1) AS pendiente
     FROM suscripciones s
     JOIN instalaciones i ON i.id = s.instalacion_id
     JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN tarjetas t ON t.cliente_id = c.id AND t.estado = 'activa'
     CROSS JOIN LATERAL (
       SELECT g.inicio::date AS inicio, date_trunc('month', g.inicio)::date AS periodo
       FROM generate_series((s.fecha_inicio + make_interval(months => s.meses_gratis))::timestamp,
                            (s.fecha_termino - 1)::timestamp, make_interval(months => fn_meses_periodo(s.frecuencia_pago))) g(inicio)
       WHERE g.inicio::date <= fn_hoy()
         AND NOT EXISTS (SELECT 1 FROM pagos x WHERE x.suscripcion_id = s.id AND x.estado IN ('pagado', 'pendiente')
                         AND x.periodo = date_trunc('month', g.inicio)::date)
       ORDER BY g.inicio LIMIT 1) p
     WHERE s.estado = 'vigente'
     ORDER BY p.inicio, s.codigo`);
  const plazo = await plazoPago();
  const hoy = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  return rows.map((r) => {
    const dias = Math.round((hoy - Date.parse(r.inicio)) / 864e5);
    const quedan = plazo - dias;
    let accion;
    if (quedan < 0) accion = 'cerrar';
    else if (r.tarjeta_id) {
      if (r.pendiente?.canal === 'tarjeta') accion = 'en_proceso';
      else if (r.intentos >= maxIntentos) accion = 'agotado';
      else if (r.intento_hoy) accion = 'manana';
      else accion = 'cobrar_tarjeta';
    } else if (!r.email) accion = 'sin_correo';
    else if (r.pendiente) accion = 'enlace_enviado';
    else accion = 'crear_enlace';
    return { ...r, accion, max_intentos: maxIntentos, dias_pendiente: dias, quedan_dias: Math.max(0, quedan), plazo };
  });
}

// Ejecuta los cobros del día: tarjetas y enlaces nuevos. Devuelve el resultado de cada uno.
export async function ejecutarCobros({ req = null, perfilId = null, origen = 'automatico' } = {}) {
  const lista = await cobrosDelDia();
  const resultado = [];
  for (const r of lista) {
    try {
      if (r.accion === 'cobrar_tarjeta') {
        const x = await cobrarConTarjeta(r.id, { origen, perfilId });
        resultado.push({ suscripcion: r.codigo, accion: 'tarjeta', ...x });
      } else if (r.accion === 'crear_enlace') {
        const c = await crearEnlacePago(req, r.id, { cantidad: 1, origen, perfilId });
        resultado.push({ suscripcion: r.codigo, accion: 'enlace', estado: c.estado });
      } else if (r.accion === 'cerrar') {
        // Primero se revisa si alcanzó a pagar en Flow; si no, se cierra desde el día en que dejó de estar cubierta
        const estado = r.pendiente ? await actualizarCobro(r.pendiente).catch(() => 'pendiente') : null;
        if (estado === 'pagado') { resultado.push({ suscripcion: r.codigo, accion: 'revisar_enlace', estado }); continue; }
        if (r.pendiente) await pool.query("UPDATE cobros SET estado = 'expirado', error = 'Venció el plazo de pago' WHERE id = $1 AND estado = 'pendiente'", [r.pendiente.id]);
        await pool.query('SELECT fn_cerrar_suscripcion($1, $2, $3::date)', [r.id, 'Falta de pago', r.inicio]);
        resultado.push({ suscripcion: r.codigo, accion: 'cerrar', estado: 'cerrada' });
      } else if (r.accion === 'enlace_enviado' && r.pendiente) {
        const estado = await actualizarCobro(r.pendiente);
        resultado.push({ suscripcion: r.codigo, accion: 'revisar_enlace', estado });
      }
    } catch (err) {
      resultado.push({ suscripcion: r.codigo, accion: r.accion, estado: 'error', error: err.message });
    }
  }
  return resultado;
}

// Revisa en Flow los cobros que siguen pendientes (por si el aviso de Flow no llegó)
export async function revisarPendientes() {
  const { rows } = await pool.query("SELECT * FROM cobros WHERE estado = 'pendiente' ORDER BY created_at LIMIT 50");
  let actualizados = 0;
  for (const c of rows) {
    const vencido = Date.now() - new Date(c.created_at).getTime() > DIAS_ENLACE * 864e5;
    const estado = await actualizarCobro(c).catch(() => 'pendiente');
    if (estado !== 'pendiente') actualizados++;
    else if (vencido) { await pool.query("UPDATE cobros SET estado = 'expirado' WHERE id = $1 AND estado = 'pendiente'", [c.id]); actualizados++; }
  }
  return { revisados: rows.length, actualizados };
}
