// T-28 · RF-09: agenda de mantenciones (mockups 085 a 088): calendario por mes, semana o lista,
// agendar (preventiva, correctiva o emergencia), reprogramar, asignar técnico y cancelar con motivo.
// Las preventivas del plan las agenda sola la suscripción; aquí se les asigna técnico y hora.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';
import { guardarInforme } from '../../services/informe.js';

const router = Router();
const TIPOS = ['preventiva', 'correctiva', 'emergencia'];

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Mantención no encontrada'))));

const vacio = (v) => (v === '' || v === undefined ? null : v);
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !Number.isNaN(Date.parse(f));
const horaValida = (h) => /^\d{2}:\d{2}$/.test(h || '');

const COLUMNAS = `m.id, m.tipo, m.estado, m.fecha_programada, m.fecha_realizada, m.hora_inicio, m.hora_fin, m.numero_en_plan,
  m.valor_servicio, m.costo_adicional, m.notas, m.motivo_cancelacion, m.solicitud_id, m.calificacion_cliente, m.created_at,
  t.id AS tecnico_id, t.nombre AS tecnico, t.empresa AS tecnico_empresa,
  i.id AS instalacion_id, i.codigo AS instalacion_codigo, i.nombre AS instalacion, i.direccion, l.nombre AS localidad,
  c.id AS cliente_id, c.nombre AS cliente, c.telefono AS cliente_telefono,
  s.id AS suscripcion_id, s.codigo AS suscripcion, ts.nombre AS plan`;
const DESDE = `FROM mantenciones m
  JOIN instalaciones i ON i.id = m.instalacion_id
  JOIN clientes c ON c.id = i.cliente_id
  LEFT JOIN localidades l ON l.id = i.localidad_id
  LEFT JOIN tecnicos t ON t.id = m.tecnico_id
  LEFT JOIN suscripciones s ON s.id = m.suscripcion_id
  LEFT JOIN tipos_suscripcion ts ON ts.id = s.tipo_suscripcion_id`;

// Opciones del formulario: técnicos activos e instalaciones con su suscripción vigente
router.get('/opciones', async (req, res) => {
  const [tecnicos, instalaciones] = await Promise.all([
    pool.query('SELECT id, nombre, empresa FROM tecnicos WHERE activo ORDER BY nombre'),
    pool.query(
      `SELECT i.id, i.codigo, i.nombre, i.direccion, c.nombre AS cliente, s.id AS suscripcion_id, s.codigo AS suscripcion
       FROM instalaciones i JOIN clientes c ON c.id = i.cliente_id
       LEFT JOIN suscripciones s ON s.instalacion_id = i.id AND s.estado = 'vigente'
       WHERE i.activa ORDER BY coalesce(i.nombre, i.codigo)`),
  ]);
  res.json({ tecnicos: tecnicos.rows, instalaciones: instalaciones.rows });
});

// Calendario: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por fecha realizada o programada)
// ?tecnico= ?tipo= ?canceladas=1 · además las programadas sin fecha ("por agendar")
router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorHttp(400, 'Rango de fechas no válido');
  const params = [desde, hasta];
  const filtros = ['coalesce(m.fecha_realizada, m.fecha_programada) BETWEEN $1 AND $2'];
  if (req.query.canceladas !== '1') filtros.push("m.estado <> 'cancelada'");
  if (/^\d+$/.test(req.query.tecnico || '')) { params.push(Number(req.query.tecnico)); filtros.push(`m.tecnico_id = $${params.length}`); }
  if (req.query.tecnico === 'sin') filtros.push('m.tecnico_id IS NULL');
  if (TIPOS.includes(req.query.tipo)) { params.push(req.query.tipo); filtros.push(`m.tipo = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} WHERE ${filtros.join(' AND ')}
     ORDER BY coalesce(m.fecha_realizada, m.fecha_programada), m.hora_inicio NULLS LAST, m.id`, params);
  const { rows: sinFecha } = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} WHERE m.estado = 'programada' AND m.fecha_programada IS NULL ORDER BY m.created_at`);
  const { rows: [r] } = await pool.query(
    `SELECT count(*) FILTER (WHERE estado = 'programada' AND fecha_programada < fn_hoy())::int AS atrasadas,
            count(*) FILTER (WHERE estado = 'programada' AND fecha_programada >= fn_hoy() AND tecnico_id IS NULL)::int AS sin_tecnico
     FROM mantenciones`);
  res.json({ mantenciones: rows, sin_fecha: sinFecha, ...r });
});

router.get('/:id', async (req, res) => {
  const { rows: [m] } = await pool.query(
    `SELECT ${COLUMNAS}, m.trabajo_realizado, m.hallazgos, m.recomendaciones, m.requiere_inversion, m.detalle_inversion, m.comentario_cliente,
            (SELECT count(*)::int FROM mantenciones x WHERE x.suscripcion_id = m.suscripcion_id AND x.estado <> 'cancelada') AS del_plan
     ${DESDE} WHERE m.id = $1`, [req.params.id]);
  if (!m) throw new ErrorHttp(404, 'Mantención no encontrada');
  const [equipos, documentos, anterior, activos] = await Promise.all([
    pool.query('SELECT id, tipo, marca, modelo, cantidad, motivo_retiro FROM equipos WHERE mantencion_retiro_id = $1', [m.id]),
    pool.query('SELECT id, tipo, nombre, visible_cliente, created_at FROM documentos WHERE mantencion_id = $1 ORDER BY created_at', [m.id]),
    // Recomendación de la última visita realizada antes de esta
    pool.query(
      `SELECT id, fecha_realizada, recomendaciones, requiere_inversion, detalle_inversion FROM mantenciones
       WHERE instalacion_id = $1 AND estado = 'realizada' AND id <> $2 AND fecha_realizada <= coalesce($3, fn_hoy())
         AND (nullif(trim(recomendaciones), '') IS NOT NULL OR requiere_inversion)
       ORDER BY fecha_realizada DESC LIMIT 1`, [m.instalacion_id, m.id, m.fecha_programada]),
    pool.query("SELECT tipo, count(*)::int AS n FROM equipos WHERE instalacion_id = $1 AND activo GROUP BY tipo ORDER BY tipo", [m.instalacion_id]),
  ]);
  res.json({ ...m, equipos_retirados: equipos.rows, documentos: documentos.rows, anterior: anterior.rows[0] ?? null, equipos_activos: activos.rows });
});

function datos(b, { parcial = false } = {}) {
  const tipo = b.tipo ?? (parcial ? undefined : 'preventiva');
  if (tipo !== undefined && !TIPOS.includes(tipo)) throw new ErrorHttp(400, 'Elige el tipo de mantención');
  const fecha = vacio(b.fecha_programada);
  if (fecha && !fechaValida(fecha)) throw new ErrorHttp(400, 'La fecha no es válida');
  const hora = vacio(b.hora_inicio);
  if (hora && !horaValida(hora)) throw new ErrorHttp(400, 'La hora no es válida');
  const valor = vacio(b.valor_servicio);
  if (valor !== null && !(Number.isInteger(Number(valor)) && Number(valor) >= 0)) throw new ErrorHttp(400, 'El valor debe ser un número entero');
  return { tipo, fecha, hora, tecnico: vacio(b.tecnico_id), valor: valor === null ? null : Number(valor), notas: vacio(String(b.notas ?? '').trim()) };
}

async function validarTecnico(id) {
  if (!id) return;
  const { rowCount } = await pool.query('SELECT 1 FROM tecnicos WHERE id = $1 AND activo', [id]);
  if (!rowCount) throw new ErrorHttp(400, 'El técnico no existe o está inactivo');
}

// Agendar (088). Si la instalación tiene suscripción vigente la mantención queda en su plan;
// si no, es un servicio aparte (su cobro se definirá con el cliente).
router.post('/', async (req, res) => {
  const d = datos(req.body);
  const { rows: [i] } = await pool.query(
    `SELECT i.id, i.activa, s.id AS suscripcion_id FROM instalaciones i
     LEFT JOIN suscripciones s ON s.instalacion_id = i.id AND s.estado = 'vigente' WHERE i.id = $1`, [Number(req.body.instalacion_id) || 0]);
  if (!i) throw new ErrorHttp(400, 'Elige la instalación');
  if (!i.activa) throw new ErrorHttp(400, 'La instalación está desactivada');
  if (!d.fecha) throw new ErrorHttp(400, 'Indica la fecha');
  await validarTecnico(d.tecnico);
  let solicitud = null;
  if (/^\d+$/.test(String(req.body.solicitud_id ?? ''))) {
    const { rows: [s] } = await pool.query(
      'SELECT s.id FROM solicitudes s JOIN instalaciones x ON x.cliente_id = s.cliente_id WHERE s.id = $1 AND x.id = $2', [Number(req.body.solicitud_id), i.id]);
    if (!s) throw new ErrorHttp(400, 'La solicitud no es del cliente de esta instalación');
    solicitud = s.id;
  }
  const { rows: [m] } = await pool.query(
    `INSERT INTO mantenciones (instalacion_id, suscripcion_id, solicitud_id, tipo, estado, fecha_programada, hora_inicio, tecnico_id, valor_servicio, notas)
     VALUES ($1, $2, $3, $4, 'programada', $5, $6, $7, $8, $9) RETURNING id`,
    [i.id, i.suscripcion_id, solicitud, d.tipo, d.fecha, d.hora, d.tecnico, d.valor, d.notas]);
  // La solicitud que originó la visita queda en proceso (ya tiene mantención agendada)
  if (solicitud) await pool.query("UPDATE solicitudes SET estado = 'en_proceso', atendida_por = $2, atendida_at = coalesce(atendida_at, now()) WHERE id = $1 AND estado = 'nueva'", [solicitud, req.usuario.id]);
  res.status(201).json({ id: m.id, en_plan: Boolean(i.suscripcion_id) });
});

// Reprogramar o asignar técnico (solo las programadas)
router.put('/:id', async (req, res) => {
  const d = datos(req.body, { parcial: true });
  if (!d.fecha) throw new ErrorHttp(400, 'Indica la fecha');
  await validarTecnico(d.tecnico);
  const { rowCount } = await pool.query(
    `UPDATE mantenciones SET fecha_programada = $2, hora_inicio = $3, tecnico_id = $4, valor_servicio = COALESCE($5, valor_servicio), notas = $6
     WHERE id = $1 AND estado = 'programada'`, [req.params.id, d.fecha, d.hora, d.tecnico, d.valor, d.notas]);
  if (!rowCount) throw new ErrorHttp(409, 'Solo se pueden cambiar mantenciones programadas');
  res.json({ ok: true });
});

// T-32 · Informe de la mantención (089): la deja "realizada" (o corrige el informe). Lo ve el cliente.
router.post('/:id/informe', async (req, res) => {
  await guardarInforme(req.params.id, req.body);
  res.json({ ok: true });
});

// Cancelar (no se borra): con motivo
router.post('/:id/cancelar', async (req, res) => {
  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) throw new ErrorHttp(400, 'Indica el motivo de la cancelación');
  const { rowCount } = await pool.query(
    "UPDATE mantenciones SET estado = 'cancelada', motivo_cancelacion = $2 WHERE id = $1 AND estado = 'programada'", [req.params.id, motivo]);
  if (!rowCount) throw new ErrorHttp(409, 'Solo se pueden cancelar mantenciones programadas');
  res.json({ ok: true });
});

export default router;
