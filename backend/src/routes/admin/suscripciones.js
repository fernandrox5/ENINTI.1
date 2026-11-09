// T-21 · RF-07, RF-08: suscripciones — listado, detalle, inscripción manual y cierre (mockups 072 a 078).
// El cliente contrata, renueva y cancela desde su portal; una nueva queda enlazada a la anterior
// por suscripcion_anterior_id y nada se borra.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';

const router = Router();
const POR_PAGINA = 20;
const ESTADOS = ['vigente', 'vencida', 'cerrada'];

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Suscripción no encontrada'))));

const vacio = (v) => (v === '' || v === undefined ? null : v);
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));

// Valida plan, fecha, meses gratis y monto comunes a crear y renovar
async function datosPlan(b, db = pool) {
  const { rows: [plan] } = await db.query('SELECT id, activo, monto_clp FROM tipos_suscripcion WHERE id = $1', [Number(b.tipo_suscripcion_id) || 0]);
  if (!plan) throw new ErrorHttp(400, 'Elige un plan');
  if (!plan.activo) throw new ErrorHttp(400, 'Ese plan ya no está disponible');
  const fecha = vacio(b.fecha_inicio);
  if (fecha && !fechaValida(fecha)) throw new ErrorHttp(400, 'La fecha de inicio no es válida');
  const meses = vacio(b.meses_gratis) ?? 0;
  if (!Number.isInteger(Number(meses)) || Number(meses) < 0 || Number(meses) > 12) throw new ErrorHttp(400, 'Los meses gratis van de 0 a 12');
  const monto = vacio(b.monto_pactado);
  if (monto !== null && !(Number.isInteger(Number(monto)) && Number(monto) >= 0)) throw new ErrorHttp(400, 'El monto pactado debe ser un número entero');
  return { plan: plan.id, fecha, meses: Number(meses), monto: monto === null ? null : Number(monto) };
}

async function condicionesVigentes(db = pool) {
  const { rows: [c] } = await db.query('SELECT id FROM condiciones_servicio WHERE vigente_hasta IS NULL ORDER BY vigente_desde DESC LIMIT 1');
  return c?.id ?? null;
}

// Listado (072): ?estado=vigente|vencida|cerrada · ?pago=todas|al_dia|deuda · ?q= · ?pagina=
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : 'vigente';
  const pagos = { todas: 'TRUE', al_dia: 'v.periodos_adeudados = 0', deuda: 'v.periodos_adeudados > 0' };
  const pago = pagos[req.query.pago] ? req.query.pago : 'todas';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const params = [];
  let busqueda = 'TRUE';
  if (q) { params.push(`%${q}%`); busqueda = '(v.codigo ILIKE $1 OR v.cliente_nombre ILIKE $1 OR v.instalacion_nombre ILIKE $1 OR v.instalacion_codigo ILIKE $1)'; }
  if (/^\d+$/.test(req.query.cliente || '')) busqueda += ` AND v.cliente_id = ${Number(req.query.cliente)}`;
  const { rows: [conteo] } = await pool.query(
    `SELECT ${ESTADOS.map((e) => `count(*) FILTER (WHERE v.estado = '${e}')::int AS ${e}`).join(', ')},
            count(*) FILTER (WHERE v.estado = $${params.length + 1} AND v.periodos_adeudados = 0)::int AS al_dia,
            count(*) FILTER (WHERE v.estado = $${params.length + 1} AND v.periodos_adeudados > 0)::int AS deuda
     FROM v_suscripciones_estado v WHERE ${busqueda}`,
    [...params, estado]
  );
  const { rows } = await pool.query(
    `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre, v.fecha_inicio, v.fecha_termino, v.fecha_cierre, v.motivo_cierre,
            v.dias_restantes, v.pagado_hasta, v.periodos_adeudados, v.pagos_por_validar, v.monto_pactado, v.frecuencia_pago,
            v.cliente_id, v.cliente_nombre, v.instalacion_id, v.instalacion_codigo, v.instalacion_nombre, v.direccion,
            EXISTS (SELECT 1 FROM suscripciones n WHERE n.suscripcion_anterior_id = v.suscripcion_id) AS tiene_siguiente
     FROM v_suscripciones_estado v
     WHERE ${busqueda} AND v.estado = $${params.length + 1} AND ${pagos[pago]}
     ORDER BY ${estado === 'vigente' ? 'v.fecha_termino, v.codigo' : 'coalesce(v.fecha_cierre, v.fecha_termino) DESC, v.codigo'}
     LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`,
    [...params, estado]
  );
  const total = pago === 'todas' ? conteo[estado] : conteo[pago];
  res.json({ suscripciones: rows, total, pagina, por_pagina: POR_PAGINA, conteo });
});

// Instalaciones para el formulario de nueva suscripción (077 y 078): ?q= · ?instalacion= (la preseleccionada va primero)
router.get('/instalaciones', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const elegida = Number(req.query.instalacion) || 0;
  const params = [elegida];
  let busqueda = 'TRUE';
  if (q) { params.push(`%${q}%`); busqueda = '(i.codigo ILIKE $2 OR i.nombre ILIKE $2 OR i.direccion ILIKE $2 OR c.nombre ILIKE $2)'; }
  const { rows } = await pool.query(
    `SELECT i.id, i.codigo, i.nombre, i.direccion, c.id AS cliente_id, c.nombre AS cliente,
            s.id AS vigente_id, s.codigo AS vigente_codigo,
            (SELECT max(coalesce(u.fecha_cierre, u.fecha_termino)) FROM suscripciones u WHERE u.instalacion_id = i.id) AS ultima_hasta
     FROM instalaciones i
     JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN suscripciones s ON s.instalacion_id = i.id AND s.estado = 'vigente'
     WHERE i.activa AND (${busqueda} OR i.id = $1)
     ORDER BY (i.id = $1) DESC, (s.id IS NULL) DESC, i.codigo
     LIMIT 8`,
    params
  );
  res.json(rows);
});

// Detalle (073)
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

// Inscripción manual (077), solo para casos especiales: lo normal es que el cliente contrate desde su portal.
// Si la instalación ya tiene una vigente, no se puede (078).
router.post('/', async (req, res) => {
  const b = req.body;
  const { rows: [inst] } = await pool.query('SELECT id, activa FROM instalaciones WHERE id = $1', [Number(b.instalacion_id) || 0]);
  if (!inst) throw new ErrorHttp(400, 'Elige una instalación');
  if (!inst.activa) throw new ErrorHttp(400, 'La instalación está desactivada');
  const { rows: [vigente] } = await pool.query("SELECT id, codigo FROM suscripciones WHERE instalacion_id = $1 AND estado = 'vigente'", [inst.id]);
  if (vigente) throw new ErrorHttp(409, `La instalación ya tiene la suscripción ${vigente.codigo} vigente. Renuévala o ciérrala primero.`);
  const d = await datosPlan(b);
  const condiciones = b.acepto_condiciones ? await condicionesVigentes() : null;
  const { rows: [s] } = await pool.query(
    `INSERT INTO suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio, meses_gratis, monto_pactado, condiciones_id, creada_por)
     VALUES ($1, $2, COALESCE($3::date, fn_hoy()), $4, $5, $6, $7) RETURNING id, codigo`,
    [inst.id, d.plan, d.fecha, d.meses, d.monto, condiciones, req.usuario.id]);
  const { rows: [m] } = await pool.query("SELECT count(*)::int AS n FROM mantenciones WHERE suscripcion_id = $1", [s.id]);
  res.status(201).json({ ...s, mantenciones: m.n });
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
  const { rows: [{ despues }] } = await pool.query(
    "SELECT count(*)::int AS despues FROM mantenciones WHERE suscripcion_id = $1 AND estado = 'cancelada'", [s.id]);
  res.json({ ok: true, mantenciones_canceladas: despues - antes });
});

export default router;
