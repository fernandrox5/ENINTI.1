// T-21 · RF-07, RF-08: suscripciones — listado, detalle y cierre (mockups 072 a 076).
// El cliente contrata, renueva y cancela desde su portal; una nueva queda enlazada a la anterior
// por suscripcion_anterior_id y nada se borra.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';
import { notificar } from '../../services/notificar.js';

const router = Router();
const POR_PAGINA = 20;

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Suscripción no encontrada'))));

const vacio = (v) => (v === '' || v === undefined ? null : v);
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));

// Listado (072): ?vista=todas|vigentes|pendientes|terminadas · ?q= · ?cliente= · ?pagina=
//   vigentes: todas las vigentes · pendientes: vigentes con el pago del mes pendiente · terminadas: vencidas o cerradas
const VISTAS = {
  todas: 'TRUE',
  vigentes: "v.estado = 'vigente'",
  pendientes: "v.estado = 'vigente' AND v.periodos_adeudados > 0",
  terminadas: "v.estado IN ('vencida', 'cerrada')",
};
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const vista = VISTAS[req.query.vista] ? req.query.vista : ['vencida', 'cerrada'].includes(req.query.estado) ? 'terminadas' : 'vigentes';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const params = [];
  let busqueda = 'TRUE';
  if (q) { params.push(`%${q}%`); busqueda = '(v.codigo ILIKE $1 OR v.cliente_nombre ILIKE $1 OR v.instalacion_nombre ILIKE $1 OR v.instalacion_codigo ILIKE $1)'; }
  if (/^\d+$/.test(req.query.cliente || '')) busqueda += ` AND v.cliente_id = ${Number(req.query.cliente)}`;
  const { rows: [conteo] } = await pool.query(
    `SELECT ${Object.entries(VISTAS).map(([k, w]) => `count(*) FILTER (WHERE ${w})::int AS ${k}`).join(', ')}
     FROM v_suscripciones_estado v WHERE ${busqueda}`, params);
  const { rows } = await pool.query(
    `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre, v.fecha_inicio, v.fecha_termino, v.fecha_cierre, v.motivo_cierre,
            v.dias_restantes, v.pagado_hasta, v.periodos_adeudados, v.pagos_por_validar, v.monto_pactado, v.frecuencia_pago,
            v.cliente_id, v.cliente_nombre, v.instalacion_id, v.instalacion_codigo, v.instalacion_nombre, v.direccion,
            EXISTS (SELECT 1 FROM suscripciones n WHERE n.suscripcion_anterior_id = v.suscripcion_id) AS tiene_siguiente
     FROM v_suscripciones_estado v
     WHERE ${busqueda} AND ${VISTAS[vista]}
     ORDER BY ${vista === 'todas' ? "(v.estado = 'vigente') DESC, coalesce(v.fecha_cierre, v.fecha_termino) DESC, v.codigo" : vista === 'terminadas' ? 'coalesce(v.fecha_cierre, v.fecha_termino) DESC, v.codigo' : 'v.fecha_termino, v.codigo'}
     LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, params);
  res.json({ suscripciones: rows, total: conteo[vista], pagina, por_pagina: POR_PAGINA, conteo });
});

// Instalaciones para el formulario de nueva suscripción (077 y 078): ?q= · ?instalacion= (la preseleccionada va primero)
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const { rows: [s] } = await pool.query(
    `SELECT v.*, v.suscripcion_id AS id, t.mantenciones_por_anio, t.duracion_meses, t.monto_clp AS monto_plan,
            s.acepto_condiciones_at, s.condiciones_id, cs.version AS condiciones_version, cs.archivo_path AS condiciones_archivo,
            s.created_at, p.nombre AS creada_por
     FROM v_suscripciones_estado v
     JOIN suscripciones s ON s.id = v.suscripcion_id
     JOIN tipos_suscripcion t ON t.id = v.tipo_suscripcion_id
     LEFT JOIN condiciones_servicio cs ON cs.id = s.condiciones_id
     LEFT JOIN perfiles p ON p.id = s.creada_por
     WHERE v.suscripcion_id = $1`, [id]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada');
  const [anterior, siguiente, mantenciones, pagos] = await Promise.all([
    pool.query(
      `SELECT a.id, a.codigo, a.estado, a.motivo_cierre, t.nombre AS tipo_nombre
       FROM suscripciones a JOIN tipos_suscripcion t ON t.id = a.tipo_suscripcion_id WHERE a.id = $1`, [s.suscripcion_anterior_id]),
    pool.query(
      `SELECT n.id, n.codigo, n.estado, t.nombre AS tipo_nombre
       FROM suscripciones n JOIN tipos_suscripcion t ON t.id = n.tipo_suscripcion_id
       WHERE n.suscripcion_anterior_id = $1 ORDER BY n.id LIMIT 1`, [id]),
    pool.query(
      `SELECT m.id, m.numero_en_plan, m.tipo, m.estado, m.fecha_programada, m.fecha_realizada, t.nombre AS tecnico
       FROM mantenciones m LEFT JOIN tecnicos t ON t.id = m.tecnico_id
       WHERE m.suscripcion_id = $1 ORDER BY coalesce(m.fecha_realizada, m.fecha_programada), m.id`, [id]),
    pool.query(
      `SELECT id, periodo, monto, estado, medio_pago, fecha_pago
       FROM pagos WHERE suscripcion_id = $1 ORDER BY periodo DESC, id DESC`, [id]),
  ]);
  res.json({ ...s, anterior: anterior.rows[0] ?? null, siguiente: siguiente.rows[0] ?? null, mantenciones: mantenciones.rows, pagos: pagos.rows });
});

// Cerrar (076): con motivo y fecha; las mantenciones programadas después del cierre se cancelan solas
router.post('/:id/cerrar', async (req, res) => {
  const motivo = req.body.motivo?.trim();
  if (!motivo) throw new ErrorHttp(400, 'Indica el motivo del cierre');
  const fecha = vacio(req.body.fecha);
  if (fecha && !fechaValida(fecha)) throw new ErrorHttp(400, 'La fecha de cierre no es válida');
  const { rows: [s] } = await pool.query('SELECT id, estado, fecha_inicio FROM suscripciones WHERE id = $1', [req.params.id]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada');
  if (s.estado === 'cerrada') throw new ErrorHttp(409, 'La suscripción ya está cerrada');
  if (fecha && fecha < s.fecha_inicio) throw new ErrorHttp(400, 'La fecha de cierre no puede ser anterior al inicio');
  const { rows: [{ antes }] } = await pool.query(
    "SELECT count(*)::int AS antes FROM mantenciones WHERE suscripcion_id = $1 AND estado = 'cancelada'", [s.id]);
  await pool.query('SELECT fn_cerrar_suscripcion($1, $2, $3::date)', [s.id, motivo, fecha]);
  await notificar('suscripcion_cerrada', { suscripcion_id: s.id }, req);
  const { rows: [{ despues }] } = await pool.query(
    "SELECT count(*)::int AS despues FROM mantenciones WHERE suscripcion_id = $1 AND estado = 'cancelada'", [s.id]);
  res.json({ ok: true, mantenciones_canceladas: despues - antes });
});

export default router;
