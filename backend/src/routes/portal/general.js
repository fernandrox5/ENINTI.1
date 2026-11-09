// T-27 · Portal del cliente (mockups 008 a 017, 038 a 044): inicio con avisos, sus instalaciones
// (tengan o no suscripción), ficha con equipos, documentos y suscripción, planes y su perfil.
// Todo se filtra por el cliente de la sesión: nunca se recibe un cliente_id del navegador.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase, clienteAuth } from '../../config/supabase.js';
import { ErrorHttp } from '../../utils/validar.js';
import { cobrarConTarjeta, crearEnlacePago, plazoPago } from '../../services/cobros.js';

const router = Router();

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Instalación no encontrada'))));

async function miCliente(req) {
  const { rows: [c] } = await pool.query(
    `SELECT c.id, c.nombre, c.rut, c.email, c.telefono, c.direccion, l.nombre AS localidad
     FROM clientes c LEFT JOIN localidades l ON l.id = c.localidad_id WHERE c.perfil_id = $1`, [req.usuario.id]);
  if (!c) throw new ErrorHttp(404, 'Tu cuenta no está asociada a un cliente. Escríbenos para revisarlo.');
  return c;
}

// Instalaciones del cliente con su suscripción vigente (si tiene) y sus mantenciones
async function instalaciones(clienteId, soloId = null) {
  const { rows } = await pool.query(
    `SELECT i.id, i.codigo, i.nombre, i.direccion, i.potencia_kwp, i.tipo_sistema, i.fecha_instalacion, l.nombre AS localidad, l.comuna,
            v.suscripcion_id, v.codigo AS suscripcion_codigo, v.tipo_nombre AS plan, v.monto_pactado, v.frecuencia_pago,
            v.fecha_inicio, v.fecha_termino, v.dias_restantes, v.meses_gratis, v.periodos_pagados, v.periodos_adeudados, v.monto_adeudado,
            v.pagos_por_validar, v.pagado_hasta, v.proxima_mantencion,
            (SELECT (t.duracion_meses / fn_meses_periodo(v.frecuencia_pago))::int FROM tipos_suscripcion t WHERE t.id = v.tipo_suscripcion_id) AS periodos_totales,
            (SELECT max(m.fecha_realizada) FROM mantenciones m WHERE m.instalacion_id = i.id AND m.estado = 'realizada') AS ultima_mantencion,
            (SELECT min(m.fecha_programada) FROM mantenciones m WHERE m.instalacion_id = i.id AND m.estado = 'programada' AND m.fecha_programada >= fn_hoy()) AS proxima,
            (SELECT row_to_json(x) FROM (SELECT u.id, u.codigo, u.estado, u.fecha_termino, t.nombre AS plan FROM suscripciones u JOIN tipos_suscripcion t ON t.id = u.tipo_suscripcion_id
               WHERE u.instalacion_id = i.id ORDER BY u.fecha_inicio DESC, u.id DESC LIMIT 1) x) AS ultima_suscripcion
     FROM instalaciones i
     LEFT JOIN localidades l ON l.id = i.localidad_id
     LEFT JOIN v_suscripciones_estado v ON v.instalacion_id = i.id AND v.estado = 'vigente'
     WHERE i.cliente_id = $1 AND i.activa ${soloId ? 'AND i.id = $2' : ''}
     ORDER BY i.codigo`, soloId ? [clienteId, soloId] : [clienteId]);
  // Pago pendiente: el periodo en curso empezó y no está pagado; quedan días del plazo antes de cerrarse
  const plazo = await plazoPago();
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  for (const i of rows) {
    i.pago_pendiente = null;
    if (!i.suscripcion_id) continue;
    const d = new Date(`${i.pagado_hasta ?? i.fecha_inicio}T12:00:00Z`);
    if (i.pagado_hasta) d.setUTCDate(d.getUTCDate() + 1); else d.setUTCMonth(d.getUTCMonth() + (i.meses_gratis ?? 0));
    const desde = d.toISOString().slice(0, 10);
    if (desde <= hoy) i.pago_pendiente = { desde, dias: Math.round((Date.parse(hoy) - Date.parse(desde)) / 864e5), quedan_dias: Math.max(0, plazo - Math.round((Date.parse(hoy) - Date.parse(desde)) / 864e5)) };
  }
  return rows;
}

// Avisos del inicio (043): vencimientos, deuda, pagos en revisión, mantenciones, equipos y sin plan
async function avisos(clienteId, lista) {
  const out = [];
  const { rowCount: conTarjeta } = await pool.query("SELECT 1 FROM tarjetas WHERE cliente_id = $1 AND estado = 'activa'", [clienteId]);
  for (const i of lista) {
    const nombre = i.nombre || i.codigo;
    if (i.suscripcion_id) {
      // Con tarjeta, el día del cobro todavía no hay nada que avisar: se cobra sola
      if (i.pago_pendiente && !(conTarjeta && i.pago_pendiente.dias === 0)) {
        const q = i.pago_pendiente.quedan_dias;
        out.push({ tipo: 'deuda', tono: 'mala', texto: `El pago de ${nombre} está pendiente: ${q === 0 ? 'hoy es el último día' : `tienes ${q} ${q === 1 ? 'día' : 'días'}`} para pagar o tu plan se cancelará`, accion: 'Pagar o actualizar mi tarjeta', a: '/portal/pagos' });
      }
      if (i.dias_restantes <= 30) out.push({ tipo: 'vence', tono: 'alerta', texto: i.dias_restantes <= 0 ? `Tu plan de ${nombre} vence hoy` : `Tu plan de ${nombre} vence en ${i.dias_restantes} ${i.dias_restantes === 1 ? 'día' : 'días'}`, accion: 'Ver mi suscripción', a: `/portal/instalaciones/${i.id}?pestana=suscripcion` });
      if (i.pagos_por_validar > 0) out.push({ tipo: 'revision', tono: 'neutra', texto: `Tienes un pago de ${nombre} en revisión`, accion: 'Ver historial de pagos', a: '/portal/pagos' });
    } else {
      const u = i.ultima_suscripcion;
      out.push(u
        ? { tipo: 'vencida', tono: 'alerta', texto: `El plan de ${nombre} ${u.estado === 'cerrada' ? 'terminó' : 'venció'} el ${new Date(`${u.fecha_termino}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`, accion: 'Quiero renovar', a: `/portal/planes?instalacion=${i.id}` }
        : { tipo: 'sin_plan', tono: 'info', texto: `${nombre} no tiene un plan de mantención`, accion: 'Conoce los planes', a: `/portal/planes?instalacion=${i.id}` });
    }
    if (i.proxima) {
      const dias = Math.round((Date.parse(i.proxima) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5);
      if (dias <= 30) out.push({ tipo: 'mantencion', tono: 'buena', texto: `Mantención de ${nombre} el ${new Date(`${i.proxima}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`, accion: 'Ver detalle', a: '/portal/mantenciones' });
    }
  }
  const { rows: equipos } = await pool.query(
    `SELECT e.tipo, i.id AS instalacion_id, coalesce(i.nombre, i.codigo) AS instalacion,
            (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date AS fin
     FROM equipos e JOIN instalaciones i ON i.id = e.instalacion_id
     WHERE i.cliente_id = $1 AND i.activa AND e.activo AND e.vida_util_anios IS NOT NULL AND e.fecha_instalacion IS NOT NULL
       AND (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date <= fn_hoy() + 365`, [clienteId]);
  const NOMBRE = { panel: 'Los paneles', inversor: 'El inversor', bateria: 'La batería', estructura: 'La estructura', medidor: 'El medidor', otro: 'Un equipo' };
  for (const e of equipos) {
    out.push({ tipo: 'equipo', tono: 'alerta', texto: `${NOMBRE[e.tipo]} de ${e.instalacion} ${e.fin < new Date().toISOString().slice(0, 10) ? 'cumplió su vida útil' : 'está cerca del fin de su vida útil'}`, accion: 'Ver equipos', a: `/portal/instalaciones/${e.instalacion_id}?pestana=equipos` });
  }
  const orden = { deuda: 0, vence: 1, vencida: 2, revision: 3, mantencion: 4, equipo: 5, sin_plan: 6 };
  return out.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

router.get('/inicio', async (req, res) => {
  const c = await miCliente(req);
  const lista = await instalaciones(c.id);
  const { rows: [p] } = await pool.query('SELECT nombre FROM perfiles WHERE id = $1', [req.usuario.id]);
  res.json({ nombre: p?.nombre || c.nombre, instalaciones: lista, avisos: await avisos(c.id, lista) });
});

router.get('/instalaciones', async (req, res) => {
  const c = await miCliente(req);
  res.json(await instalaciones(c.id));
});

// Ficha de una instalación (010 a 017): solo documentos visibles para el cliente
router.get('/instalaciones/:id', async (req, res) => {
  const c = await miCliente(req);
  const [i] = await instalaciones(c.id, Number(req.params.id));
  if (!i) throw new ErrorHttp(404, 'Instalación no encontrada');
  const [equipos, documentos, suscripciones, plan] = await Promise.all([
    pool.query(
      `SELECT e.id, e.tipo, e.marca, e.modelo, e.cantidad, e.potencia_unitaria_w, e.capacidad_kwh, e.fecha_instalacion, e.garantia_hasta,
              e.activo, e.fecha_retiro, e.motivo_retiro, (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date AS fin_vida_util
       FROM equipos e WHERE e.instalacion_id = $1 ORDER BY e.activo DESC, e.tipo, e.id`, [i.id]),
    pool.query("SELECT id, tipo, nombre, created_at FROM documentos WHERE instalacion_id = $1 AND visible_cliente ORDER BY created_at DESC", [i.id]),
    pool.query(
      `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre AS plan, v.fecha_inicio, v.fecha_termino, v.fecha_cierre, v.motivo_cierre,
              s.version_condiciones, s.acepto_condiciones_at, cs.archivo_path AS condiciones_archivo
       FROM v_suscripciones_estado v JOIN suscripciones s ON s.id = v.suscripcion_id
       LEFT JOIN condiciones_servicio cs ON cs.id = s.condiciones_id
       WHERE v.instalacion_id = $1 ORDER BY v.fecha_inicio DESC, v.suscripcion_id DESC`, [i.id]),
    i.suscripcion_id
      ? pool.query(
        `SELECT t.nombre, t.descripcion, t.mantenciones_por_anio, t.duracion_meses, t.incluye_reposicion_equipos, t.tiempo_respuesta_horas,
                (SELECT count(*)::int FROM mantenciones m WHERE m.suscripcion_id = s.id AND m.estado = 'realizada') AS realizadas,
                (SELECT count(*)::int FROM mantenciones m WHERE m.suscripcion_id = s.id AND m.estado <> 'cancelada') AS del_plan
         FROM suscripciones s JOIN tipos_suscripcion t ON t.id = s.tipo_suscripcion_id WHERE s.id = $1`, [i.suscripcion_id])
      : Promise.resolve({ rows: [] }),
  ]);
  res.json({ ...i, equipos: equipos.rows, documentos: documentos.rows, suscripciones: suscripciones.rows, detalle_plan: plan.rows[0] ?? null });
});

router.get('/instalaciones/:id/documentos/:doc', async (req, res) => {
  const c = await miCliente(req);
  const { rows: [d] } = await pool.query(
    `SELECT d.storage_path FROM documentos d JOIN instalaciones i ON i.id = d.instalacion_id
     WHERE d.id = $1 AND d.instalacion_id = $2 AND i.cliente_id = $3 AND d.visible_cliente`,
    [Number(req.params.doc) || 0, req.params.id, c.id]);
  if (!d) throw new ErrorHttp(404, 'Documento no encontrado');
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 300);
  if (error) throw new ErrorHttp(502, 'No se pudo abrir el documento');
  res.json({ url: data.signedUrl });
});

// Planes (038, 039), en qué instalación tiene cada uno, su tarjeta y las condiciones vigentes
router.get('/planes', async (req, res) => {
  const c = await miCliente(req);
  const [planes, mias, tarjeta, condiciones] = await Promise.all([
    pool.query(
      `SELECT id, codigo, nombre, descripcion, frecuencia_pago, monto_clp, duracion_meses, mantenciones_por_anio, incluye_reposicion_equipos, tiempo_respuesta_horas
       FROM tipos_suscripcion WHERE activo ORDER BY monto_clp`),
    instalaciones(c.id),
    pool.query("SELECT tipo, ultimos4 FROM tarjetas WHERE cliente_id = $1 AND estado = 'activa'", [c.id]),
    pool.query('SELECT version, archivo_path FROM condiciones_servicio WHERE vigente_hasta IS NULL ORDER BY vigente_desde DESC LIMIT 1'),
  ]);
  res.json({
    planes: planes.rows,
    instalaciones: mias.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, plan: i.plan, suscripcion_id: i.suscripcion_id, dias_restantes: i.dias_restantes,
      ultima_suscripcion: i.ultima_suscripcion })),
    tarjeta: tarjeta.rows[0] ?? null,
    condiciones: condiciones.rows[0] ?? null,
    correo: Boolean(c.email),
  });
});

// Contratar (o renovar una que ya venció) desde el portal, sin pasar por ENINTI: el cliente acepta las
// condiciones, se crea la suscripción enlazada a la anterior y paga el primer mes en ese momento
// (con su tarjeta inscrita o en Flow). Si no paga, corre el plazo y se cierra sola por falta de pago.
router.post('/planes/contratar', async (req, res) => {
  const c = await miCliente(req);
  if (req.body.acepto_condiciones !== true) throw new ErrorHttp(400, 'Debes aceptar las condiciones del servicio');
  if (!c.email) throw new ErrorHttp(400, 'Para pagar en línea necesitamos tu correo. Escríbenos para agregarlo.');
  const { rows: [plan] } = await pool.query('SELECT id, nombre FROM tipos_suscripcion WHERE id = $1 AND activo', [Number(req.body.tipo_suscripcion_id) || 0]);
  if (!plan) throw new ErrorHttp(400, 'Elige un plan');
  const [i] = await instalaciones(c.id, Number(req.body.instalacion_id) || 0);
  if (!i) throw new ErrorHttp(400, 'Elige la instalación');
  if (i.suscripcion_id) throw new ErrorHttp(409, `${i.nombre || i.codigo} ya tiene el ${i.plan} vigente`);
  if (req.body.medio === 'tarjeta') {
    const { rowCount } = await pool.query("SELECT 1 FROM tarjetas WHERE cliente_id = $1 AND estado = 'activa'", [c.id]);
    if (!rowCount) throw new ErrorHttp(400, 'No tienes una tarjeta inscrita: elige pagar con Flow');
  }
  const { rows: [cond] } = await pool.query('SELECT id FROM condiciones_servicio WHERE vigente_hasta IS NULL ORDER BY vigente_desde DESC LIMIT 1');
  const { rows: [s] } = await pool.query(
    `INSERT INTO suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio, condiciones_id, creada_por)
     VALUES ($1, $2, fn_hoy(), $3, $4) RETURNING id, codigo`, [i.id, plan.id, cond?.id ?? null, req.usuario.id]);
  // Primer mes: con la tarjeta inscrita se cobra ahora; si no, se abre el pago en Flow
  if (req.body.medio === 'tarjeta') {
    const r = await cobrarConTarjeta(s.id, { origen: 'cliente', perfilId: req.usuario.id });
    return res.status(201).json({ suscripcion: s, pagado: r.estado === 'pagado', error: r.error ?? null });
  }
  try {
    const cobro = await crearEnlacePago(req, s.id, { origen: 'cliente', perfilId: req.usuario.id });
    res.status(201).json({ suscripcion: s, url: cobro.url_pago });
  } catch (err) {
    // La suscripción queda creada: puede pagar después desde Pagos dentro del plazo
    res.status(201).json({ suscripcion: s, error: err.message });
  }
});

// Perfil (040, 041): nombre y teléfono; RUT, correo y dirección los cambia ENINTI
router.get('/perfil', async (req, res) => {
  const c = await miCliente(req);
  const { rows: [p] } = await pool.query('SELECT nombre, telefono FROM perfiles WHERE id = $1', [req.usuario.id]);
  res.json({ nombre: p?.nombre || c.nombre, telefono: c.telefono ?? p?.telefono ?? '', rut: c.rut, email: c.email, direccion: [c.direccion, c.localidad].filter(Boolean).join(', ') });
});

router.put('/perfil', async (req, res) => {
  const c = await miCliente(req);
  const nombre = String(req.body.nombre || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  if (nombre.length < 2) throw new ErrorHttp(400, 'Escribe tu nombre');
  if (telefono && !/^\+?[\d\s-]{8,16}$/.test(telefono)) throw new ErrorHttp(400, 'El teléfono no es válido');
  await pool.query('UPDATE perfiles SET nombre = $2, telefono = $3 WHERE id = $1', [req.usuario.id, nombre, telefono || null]);
  await pool.query('UPDATE clientes SET telefono = $2 WHERE id = $1', [c.id, telefono || null]);
  res.json({ ok: true });
});

router.post('/perfil/contrasena', async (req, res) => {
  const { actual, nueva } = req.body;
  if (!nueva || nueva.length < 8) throw new ErrorHttp(400, 'La contraseña nueva debe tener al menos 8 caracteres');
  const { error } = await clienteAuth().auth.signInWithPassword({ email: req.usuario.email, password: String(actual || '') });
  if (error) throw new ErrorHttp(400, 'La contraseña actual no es correcta');
  const upd = await supabase.auth.admin.updateUserById(req.usuario.id, { password: nueva });
  if (upd.error) {
    if (upd.error.code === 'weak_password') throw new ErrorHttp(400, 'La contraseña es muy débil, prueba con otra');
    if (upd.error.code === 'same_password') throw new ErrorHttp(400, 'La nueva contraseña debe ser distinta de la actual');
    throw upd.error;
  }
  res.json({ ok: true });
});

export default router;
