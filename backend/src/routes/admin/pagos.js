// T-23, T-25 y T-26 · Pagos (mockups 079 a 084) con cobros en línea por Flow:
// resumen del mes, pagos del mes, cobros automáticos, por validar, historial, tarjetas inscritas,
// registrar pago manual (efectivo y otros), anular, validar o rechazar comprobantes, boletas y Excel.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase } from '../../config/supabase.js';
import { ErrorHttp } from '../../utils/validar.js';
import { cobrarConTarjeta, crearEnlacePago, periodosSinPagar, revisarPendientes } from '../../services/cobros.js';

const router = Router();
const POR_PAGINA = 25;
const MEDIOS = ['efectivo', 'transferencia', 'deposito', 'tarjeta', 'otro'];

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Pago no encontrado'))));

// Mes "AAAA-MM" → [primer día, primer día del mes siguiente]; por defecto el mes actual
async function rangoMes(mes) {
  const { rows: [r] } = await pool.query(
    `SELECT d::text AS desde, (d + interval '1 month')::date::text AS hasta
     FROM (SELECT CASE WHEN $1 ~ '^\\d{4}-\\d{2}$' THEN ($1 || '-01')::date ELSE date_trunc('month', fn_hoy())::date END AS d) x`, [mes || '']);
  return r;
}

const COLUMNAS = `p.id, p.periodo, p.monto, p.fecha_pago, p.medio_pago, p.estado, p.referencia_externa, p.nro_boleta, p.boleta_emitida_at,
  p.observaciones, p.motivo_rechazo, p.motivo_anulacion, p.comprobante_path, p.cobro_id, p.created_at,
  s.id AS suscripcion_id, s.codigo AS suscripcion, c.id AS cliente_id, c.nombre AS cliente, i.nombre AS instalacion, i.codigo AS instalacion_codigo,
  r.nombre AS registrado_por, v.nombre AS validado_por, k.canal AS cobro_canal`;
const DESDE = `FROM pagos p
  JOIN suscripciones s ON s.id = p.suscripcion_id
  JOIN instalaciones i ON i.id = s.instalacion_id
  JOIN clientes c ON c.id = i.cliente_id
  LEFT JOIN perfiles r ON r.id = p.registrado_por
  LEFT JOIN perfiles v ON v.id = p.validado_por
  LEFT JOIN cobros k ON k.id = p.cobro_id`;

// Resumen del mes para las tarjetas de arriba
router.get('/resumen', async (req, res) => {
  const { desde, hasta } = await rangoMes(req.query.mes);
  const { rows: [r] } = await pool.query(
    `SELECT
       coalesce(sum(p.monto) FILTER (WHERE p.estado = 'pagado' AND p.fecha_pago >= $1 AND p.fecha_pago < $2), 0)::int AS cobrado,
       count(*) FILTER (WHERE p.estado = 'pagado' AND p.fecha_pago >= $1 AND p.fecha_pago < $2)::int AS pagos,
       count(*) FILTER (WHERE p.estado = 'pagado' AND p.fecha_pago >= $1 AND p.fecha_pago < $2 AND p.cobro_id IS NOT NULL)::int AS en_linea,
       count(*) FILTER (WHERE p.estado = 'pagado' AND p.fecha_pago >= $1 AND p.fecha_pago < $2 AND p.nro_boleta IS NOT NULL)::int AS con_boleta,
       count(*) FILTER (WHERE p.estado = 'pendiente')::int AS por_validar
     FROM pagos p`, [desde, hasta]);
  const { rows: medios } = await pool.query(
    `SELECT medio_pago AS medio, count(*)::int AS pagos, sum(monto)::int AS monto
     FROM pagos WHERE estado = 'pagado' AND fecha_pago >= $1 AND fecha_pago < $2 GROUP BY 1 ORDER BY 3 DESC`, [desde, hasta]);
  const { rows: [k] } = await pool.query(
    `SELECT (SELECT count(*) FROM cobros WHERE estado = 'rechazado' AND created_at >= fn_hoy() - 30
              AND NOT EXISTS (SELECT 1 FROM pagos x WHERE x.suscripcion_id = cobros.suscripcion_id AND x.periodo = cobros.periodo AND x.estado = 'pagado'))::int AS fallidos,
            (SELECT count(*) FROM cobros WHERE estado = 'pendiente')::int AS pendientes,
            (SELECT count(*) FROM tarjetas WHERE estado = 'activa')::int AS tarjetas,
            (SELECT count(*) FROM v_morosos)::int AS morosos,
            (SELECT coalesce(sum(monto_adeudado), 0) FROM v_suscripciones_estado WHERE estado = 'vigente')::int AS deuda`);
  res.json({ mes: desde.slice(0, 7), ...r, ...k, medios, automaticos: process.env.COBROS_AUTOMATICOS === 'true' });
});

// Pagos: ?mes=AAAA-MM (pagados en ese mes) o historial completo con ?estado= ?medio= ?q= ?pagina=
router.get('/', async (req, res) => {
  const filtros = [];
  const params = [];
  const agregar = (sql, valor) => { params.push(valor); filtros.push(sql.replace('$?', `$${params.length}`)); };
  if (req.query.mes) {
    const { desde, hasta } = await rangoMes(req.query.mes);
    agregar("p.estado = 'pagado' AND p.fecha_pago >= $?", desde);
    agregar('p.fecha_pago < $?', hasta);
  }
  if (['pagado', 'pendiente', 'rechazado', 'anulado'].includes(req.query.estado)) agregar('p.estado = $?', req.query.estado);
  if (MEDIOS.includes(req.query.medio)) agregar('p.medio_pago = $?', req.query.medio);
  if (req.query.origen === 'linea') filtros.push('p.cobro_id IS NOT NULL');
  if (req.query.origen === 'manual') filtros.push('p.cobro_id IS NULL');
  const q = String(req.query.q || '').trim();
  if (q) {
    params.push(`%${q}%`);
    const n = `$${params.length}`;
    filtros.push(`(c.nombre ILIKE ${n} OR s.codigo ILIKE ${n} OR i.nombre ILIKE ${n} OR p.nro_boleta ILIKE ${n})`);
  }
  if (/^\d+$/.test(req.query.suscripcion || '')) agregar('s.id = $?', Number(req.query.suscripcion));
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const { rows: [t] } = await pool.query(`SELECT count(*)::int AS total, coalesce(sum(p.monto) FILTER (WHERE p.estado = 'pagado'), 0)::int AS monto ${DESDE} ${donde}`, params);
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} ${donde} ORDER BY coalesce(p.fecha_pago, p.created_at) DESC, p.id DESC
     LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, params);
  res.json({ pagos: rows, total: t.total, monto: t.monto, pagina, por_pagina: POR_PAGINA });
});

// Excel (CSV que abre Excel) de los pagos del mes
router.get('/excel', async (req, res) => {
  const { desde, hasta } = await rangoMes(req.query.mes);
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} WHERE p.estado = 'pagado' AND p.fecha_pago >= $1 AND p.fecha_pago < $2 ORDER BY p.fecha_pago`, [desde, hasta]);
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '');
  const lineas = [
    ['Fecha', 'Cliente', 'Instalación', 'Suscripción', 'Periodo', 'Medio', 'Origen', 'Monto', 'Boleta', 'Referencia'].map(celda).join(';'),
    ...rows.map((p) => [fecha(p.fecha_pago), p.cliente, p.instalacion ?? p.instalacion_codigo, p.suscripcion, String(p.periodo).slice(0, 7),
      p.medio_pago, p.cobro_id ? 'En línea (Flow)' : 'Manual', p.monto, p.nro_boleta, p.referencia_externa].map(celda).join(';')),
  ];
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="pagos-${desde.slice(0, 7)}.csv"` });
  res.send('﻿' + lineas.join('\r\n'));
});

// Datos para registrar un pago manual (079): situación y periodos sin pagar
router.get('/registrar/:suscripcion', async (req, res) => {
  if (!/^\d+$/.test(req.params.suscripcion)) throw new ErrorHttp(404, 'Suscripción no encontrada');
  const { rows: [s] } = await pool.query(
    `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre, v.monto_pactado, v.frecuencia_pago, v.pagado_hasta,
            v.periodos_adeudados, v.monto_adeudado, v.cliente_id, v.cliente_nombre, v.instalacion_nombre, v.instalacion_codigo,
            (SELECT g.tipo || ' · ' || to_char(g.created_at, 'DD-MM') FROM gestiones g WHERE g.cliente_id = v.cliente_id ORDER BY g.created_at DESC LIMIT 1) AS ultima_gestion,
            (SELECT t.tipo || ' ···· ' || t.ultimos4 FROM tarjetas t WHERE t.cliente_id = v.cliente_id AND t.estado = 'activa') AS tarjeta
     FROM v_suscripciones_estado v WHERE v.suscripcion_id = $1`, [req.params.suscripcion]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada');
  const periodos = (await periodosSinPagar(s.id)).slice(0, 12);
  res.json({ ...s, periodos });
});

// Registrar pago manual (efectivo, transferencia directa, depósito o tarjeta presencial): queda "pagado"
router.post('/', async (req, res) => {
  const b = req.body;
  const medio = MEDIOS.includes(b.medio_pago) ? b.medio_pago : null;
  if (!medio) throw new ErrorHttp(400, 'Elige el medio de pago');
  const periodos = Array.isArray(b.periodos) ? [...new Set(b.periodos.map(String))] : [];
  if (!periodos.length) throw new ErrorHttp(400, 'Elige al menos un periodo');
  const monto = Number(b.monto_periodo);
  if (!Number.isInteger(monto) || monto <= 0) throw new ErrorHttp(400, 'El monto debe ser un número entero mayor que cero');
  const fecha = b.fecha_pago && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_pago) ? b.fecha_pago : null;
  const { rows: [s] } = await pool.query('SELECT id, estado FROM suscripciones WHERE id = $1', [Number(b.suscripcion_id) || 0]);
  if (!s) throw new ErrorHttp(400, 'Elige la suscripción');
  const validos = new Set((await periodosSinPagar(s.id)).map((p) => p.periodo));
  const malo = periodos.find((p) => !validos.has(p));
  if (malo) throw new ErrorHttp(409, `El periodo ${malo.slice(0, 7)} ya está pagado o no pertenece a la suscripción`);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const ids = [];
    for (const p of periodos) {
      const { rows: [r] } = await db.query(
        `INSERT INTO pagos (suscripcion_id, periodo, monto, fecha_pago, medio_pago, estado, referencia_externa, observaciones, registrado_por, validado_por)
         VALUES ($1, $2, $3, COALESCE($4::date::timestamptz, now()), $5, 'pagado', $6, $7, $8, $8) RETURNING id`,
        [s.id, p, monto, fecha, medio, b.referencia?.trim() || null, b.observaciones?.trim() || null, req.usuario.id]);
      ids.push(r.id);
    }
    // Si había un enlace de pago pendiente para esos periodos, ya no corresponde
    await db.query("UPDATE cobros SET estado = 'anulado', error = 'Pagado de forma manual' WHERE suscripcion_id = $1 AND estado = 'pendiente' AND periodo = ANY($2::date[])", [s.id, periodos]);
    await db.query('COMMIT');
    res.status(201).json({ ids, total: monto * ids.length });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new ErrorHttp(409, 'Uno de los periodos ya está pagado');
    throw err;
  } finally {
    db.release();
  }
});

// Anular un pago (no se borra): con motivo
router.post('/:id/anular', async (req, res) => {
  const motivo = req.body.motivo?.trim();
  if (!motivo) throw new ErrorHttp(400, 'Indica el motivo de la anulación');
  const { rowCount } = await pool.query("UPDATE pagos SET estado = 'anulado', motivo_anulacion = $2 WHERE id = $1 AND estado = 'pagado'", [req.params.id, motivo]);
  if (!rowCount) throw new ErrorHttp(409, 'Solo se pueden anular pagos pagados');
  res.json({ ok: true });
});

// Por validar (081): pagos informados por el cliente con comprobante
router.get('/por-validar', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE p.estado = 'pendiente' ORDER BY p.created_at`);
  res.json(rows);
});
router.get('/:id/comprobante', async (req, res) => {
  const { rows: [p] } = await pool.query('SELECT comprobante_path FROM pagos WHERE id = $1', [req.params.id]);
  if (!p?.comprobante_path) throw new ErrorHttp(404, 'El pago no tiene comprobante');
  const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(p.comprobante_path, 300);
  if (error) throw new ErrorHttp(502, 'No se pudo abrir el comprobante');
  res.json({ url: data.signedUrl });
});
router.post('/:id/validar', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE pagos SET estado = 'pagado', validado_por = $2, fecha_pago = COALESCE(fecha_pago, now()) WHERE id = $1 AND estado = 'pendiente'",
      [req.params.id, req.usuario.id]);
    if (!rowCount) throw new ErrorHttp(409, 'El pago ya no está por validar');
  } catch (err) {
    if (err.code === '23505') throw new ErrorHttp(409, 'Ese periodo ya tiene un pago registrado. Rechaza este comprobante.');
    throw err;
  }
  res.json({ ok: true });
});
router.post('/:id/rechazar', async (req, res) => {
  const motivo = req.body.motivo?.trim();
  if (!motivo) throw new ErrorHttp(400, 'Indica el motivo del rechazo');
  const { rowCount } = await pool.query(
    "UPDATE pagos SET estado = 'rechazado', motivo_rechazo = $2, validado_por = $3 WHERE id = $1 AND estado = 'pendiente'",
    [req.params.id, motivo, req.usuario.id]);
  if (!rowCount) throw new ErrorHttp(409, 'El pago ya no está por validar');
  res.json({ ok: true });
});

// Boleta emitida (083)
router.post('/:id/boleta', async (req, res) => {
  const nro = req.body.nro_boleta?.trim();
  if (!nro) throw new ErrorHttp(400, 'Indica el número de boleta');
  const { rowCount } = await pool.query(
    "UPDATE pagos SET nro_boleta = $2, boleta_emitida_at = now() WHERE id = $1 AND estado = 'pagado'", [req.params.id, nro]);
  if (!rowCount) throw new ErrorHttp(409, 'Solo los pagos pagados llevan boleta');
  res.json({ ok: true });
});

// ---------- Cobros en línea (Flow) ----------
router.get('/cobros', async (req, res) => {
  const estados = ['pendiente', 'pagado', 'rechazado', 'anulado', 'expirado'];
  const params = [];
  let donde = 'TRUE';
  if (estados.includes(req.query.estado)) { params.push(req.query.estado); donde = 'k.estado = $1'; }
  const { rows } = await pool.query(
    `SELECT k.id, k.periodo, k.cantidad_periodos, k.monto, k.canal, k.origen, k.estado, k.intento, k.commerce_order, k.flow_order,
            k.url_pago, k.medio_flow, k.error, k.created_at, k.updated_at,
            s.id AS suscripcion_id, s.codigo AS suscripcion, c.id AS cliente_id, c.nombre AS cliente
     FROM cobros k JOIN suscripciones s ON s.id = k.suscripcion_id
     JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
     WHERE ${donde} ORDER BY k.created_at DESC LIMIT 100`, params);
  res.json(rows);
});

// Revisar en Flow el estado de los pendientes
router.post('/cobros/revisar', async (req, res) => res.json(await revisarPendientes()));

// Cobrar ahora con la tarjeta de una suscripción
router.post('/suscripcion/:suscripcion/cobrar', async (req, res) => {
  if (!/^\d+$/.test(req.params.suscripcion)) throw new ErrorHttp(404, 'Suscripción no encontrada');
  res.json(await cobrarConTarjeta(Number(req.params.suscripcion), { origen: 'admin', perfilId: req.usuario.id }));
});

// Enlace de pago para mandar por WhatsApp o correo
router.post('/suscripcion/:suscripcion/enlace', async (req, res) => {
  if (!/^\d+$/.test(req.params.suscripcion)) throw new ErrorHttp(404, 'Suscripción no encontrada');
  const c = await crearEnlacePago(req, Number(req.params.suscripcion), { cantidad: req.body.cantidad, origen: 'admin', perfilId: req.usuario.id });
  res.status(201).json({ url: c.url_pago, monto: c.monto, cantidad: c.cantidad_periodos });
});

// Tarjetas inscritas y clientes que pagan con enlace
router.get('/tarjetas', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id AS cliente_id, c.nombre AS cliente, c.email, t.tipo, t.ultimos4, t.inscrita_at,
            count(s.id) FILTER (WHERE s.estado = 'vigente')::int AS vigentes,
            (SELECT max(k.created_at) FROM cobros k JOIN suscripciones x ON x.id = k.suscripcion_id JOIN instalaciones y ON y.id = x.instalacion_id
             WHERE y.cliente_id = c.id AND k.estado = 'rechazado') AS ultimo_rechazo
     FROM clientes c
     LEFT JOIN tarjetas t ON t.cliente_id = c.id AND t.estado = 'activa'
     LEFT JOIN instalaciones i ON i.cliente_id = c.id
     LEFT JOIN suscripciones s ON s.instalacion_id = i.id
     WHERE c.activo
     GROUP BY c.id, t.id
     ORDER BY (t.id IS NULL), c.nombre`);
  res.json(rows);
});

export default router;
