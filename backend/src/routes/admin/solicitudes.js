// T-29 · RF-10: solicitudes de los clientes (mockups 090 y 091). Emergencias primero.
// Se toman, se responden (lo ve el cliente), se agenda la mantención y se resuelven o cierran.
// Una emergencia se atiende aunque la instalación no tenga suscripción.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';

const router = Router();
const TIPOS = ['mantencion', 'emergencia', 'consulta'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const CANALES = ['plataforma', 'whatsapp', 'telefono', 'email', 'presencial'];
export const PRIORIDAD_POR_TIPO = { emergencia: 'alta', mantencion: 'media', consulta: 'baja' };

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Solicitud no encontrada'))));

const COLUMNAS = `s.id, s.tipo, s.prioridad, s.descripcion, s.canal, s.estado, s.respuesta, s.atendida_at, s.created_at, s.updated_at,
  c.id AS cliente_id, c.nombre AS cliente, c.telefono AS cliente_telefono, c.email AS cliente_email,
  i.id AS instalacion_id, i.codigo AS instalacion_codigo, i.nombre AS instalacion, i.tipo_sistema, i.potencia_kwp,
  p.nombre AS atendida_por,
  v.suscripcion_id, v.codigo AS suscripcion, v.periodos_adeudados, v.dias_restantes,
  (SELECT row_to_json(x) FROM (SELECT m.id, m.estado, m.fecha_programada, m.fecha_realizada FROM mantenciones m
     WHERE m.solicitud_id = s.id ORDER BY m.id DESC LIMIT 1) x) AS mantencion`;
const DESDE = `FROM solicitudes s
  JOIN clientes c ON c.id = s.cliente_id
  LEFT JOIN instalaciones i ON i.id = s.instalacion_id
  LEFT JOIN perfiles p ON p.id = s.atendida_por
  LEFT JOIN v_suscripciones_estado v ON v.instalacion_id = s.instalacion_id AND v.estado = 'vigente'`;
// Emergencias primero, luego por prioridad y antigüedad
const ORDEN = `(s.tipo = 'emergencia') DESC, array_position(ARRAY['critica','alta','media','baja']::text[], s.prioridad::text), s.created_at`;

// Dos vistas: pendientes (nuevas y en proceso, emergencias primero) y atendidas (resueltas o cerradas)
router.get('/', async (req, res) => {
  const atendidas = req.query.vista === 'atendidas';
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} WHERE s.estado IN (${atendidas ? "'resuelta', 'cerrada'" : "'nueva', 'en_proceso'"}) AND s.tipo <> 'consulta'
     ORDER BY ${atendidas ? 's.updated_at DESC' : ORDEN} LIMIT 100`);
  const { rows: [conteo] } = await pool.query(
    `SELECT count(*) FILTER (WHERE estado IN ('nueva', 'en_proceso'))::int AS pendientes,
            count(*) FILTER (WHERE estado IN ('nueva', 'en_proceso') AND tipo = 'emergencia')::int AS emergencias
     FROM solicitudes WHERE tipo <> 'consulta'`);
  res.json({ solicitudes: rows, conteo });
});

router.get('/:id', async (req, res) => {
  const { rows: [s] } = await pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE s.id = $1`, [req.params.id]);
  if (!s) throw new ErrorHttp(404, 'Solicitud no encontrada');
  res.json(s);
});

// Anotar una solicitud que llegó por teléfono, WhatsApp, correo o en persona (091)
router.post('/', async (req, res) => {
  const b = req.body;
  if (!TIPOS.includes(b.tipo)) throw new ErrorHttp(400, 'Elige el tipo de solicitud');
  const canal = CANALES.includes(b.canal) ? b.canal : 'telefono';
  const prioridad = PRIORIDADES.includes(b.prioridad) ? b.prioridad : PRIORIDAD_POR_TIPO[b.tipo];
  const descripcion = String(b.descripcion || '').trim();
  if (descripcion.length < 5) throw new ErrorHttp(400, 'Describe la solicitud');
  const { rows: [c] } = await pool.query('SELECT id FROM clientes WHERE id = $1', [Number(b.cliente_id) || 0]);
  if (!c) throw new ErrorHttp(400, 'Elige el cliente');
  let instalacion = null;
  if (b.instalacion_id) {
    const { rows: [i] } = await pool.query('SELECT id FROM instalaciones WHERE id = $1 AND cliente_id = $2', [Number(b.instalacion_id) || 0, c.id]);
    if (!i) throw new ErrorHttp(400, 'La instalación no es de ese cliente');
    instalacion = i.id;
  }
  const { rows: [s] } = await pool.query(
    `INSERT INTO solicitudes (cliente_id, instalacion_id, tipo, prioridad, descripcion, canal, estado, atendida_por, atendida_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'en_proceso', $7, now()) RETURNING id`,
    [c.id, instalacion, b.tipo, prioridad, descripcion, canal, req.usuario.id]);
  res.status(201).json({ id: s.id });
});

// Tomar: pasa a "en proceso" a cargo de quien la toma
router.post('/:id/tomar', async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE solicitudes SET estado = 'en_proceso', atendida_por = $2, atendida_at = coalesce(atendida_at, now()) WHERE id = $1 AND estado IN ('nueva', 'en_proceso')",
    [req.params.id, req.usuario.id]);
  if (!rowCount) throw new ErrorHttp(409, 'La solicitud ya está resuelta o cerrada');
  res.json({ ok: true });
});

// Responder (lo ve el cliente en su portal); ?estado=resuelta|cerrada la termina en el mismo paso
router.post('/:id/responder', async (req, res) => {
  const respuesta = String(req.body.respuesta || '').trim();
  const final = ['resuelta', 'cerrada'].includes(req.body.estado) ? req.body.estado : null;
  if (!respuesta && !final) throw new ErrorHttp(400, 'Escribe la respuesta');
  if (req.body.prioridad && !PRIORIDADES.includes(req.body.prioridad)) throw new ErrorHttp(400, 'Prioridad no válida');
  const { rowCount } = await pool.query(
    `UPDATE solicitudes SET respuesta = coalesce(nullif($2, ''), respuesta),
            estado = coalesce($3::estado_solicitud, CASE WHEN estado = 'nueva' THEN 'en_proceso'::estado_solicitud ELSE estado END),
            prioridad = coalesce($4::prioridad, prioridad), atendida_por = $5, atendida_at = coalesce(atendida_at, now())
     WHERE id = $1`, [req.params.id, respuesta, final, req.body.prioridad || null, req.usuario.id]);
  if (!rowCount) throw new ErrorHttp(404, 'Solicitud no encontrada');
  res.json({ ok: true });
});

// Reabrir una resuelta o cerrada
router.post('/:id/reabrir', async (req, res) => {
  const { rowCount } = await pool.query("UPDATE solicitudes SET estado = 'en_proceso' WHERE id = $1 AND estado IN ('resuelta', 'cerrada')", [req.params.id]);
  if (!rowCount) throw new ErrorHttp(409, 'La solicitud ya está abierta');
  res.json({ ok: true });
});

export default router;
