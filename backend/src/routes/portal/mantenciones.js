// T-31 · Portal del cliente (mockups 027 a 032): sus mantenciones próximas y realizadas, el informe
// con fotos, la calificación (una sola vez) y "Pedir cotización" cuando se recomienda una inversión.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase } from '../../config/supabase.js';
import { ErrorHttp } from '../../utils/validar.js';
import { clienteDeSesion } from '../../utils/clienteSesion.js';

const router = Router();

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Mantención no encontrada'))));

const miCliente = async (req) => (await clienteDeSesion(req)).id;

const COLUMNAS = `m.id, m.tipo, m.estado, m.fecha_programada, m.fecha_realizada, m.hora_inicio, m.hora_fin, m.numero_en_plan,
  m.calificacion_cliente, m.requiere_inversion, t.nombre AS tecnico, t.empresa AS tecnico_empresa,
  i.id AS instalacion_id, coalesce(i.nombre, i.codigo) AS instalacion,
  (SELECT count(*)::int FROM mantenciones x WHERE x.suscripcion_id = m.suscripcion_id AND x.estado <> 'cancelada') AS del_plan`;
const DESDE = `FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id LEFT JOIN tecnicos t ON t.id = m.tecnico_id`;

router.get('/', async (req, res) => {
  const cliente = await miCliente(req);
  const [proximas, realizadas] = await Promise.all([
    pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE i.cliente_id = $1 AND m.estado = 'programada'
                ORDER BY m.fecha_programada NULLS LAST, m.hora_inicio NULLS LAST`, [cliente]),
    pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE i.cliente_id = $1 AND m.estado = 'realizada'
                ORDER BY m.fecha_realizada DESC LIMIT 50`, [cliente]),
  ]);
  res.json({ proximas: proximas.rows, realizadas: realizadas.rows });
});

async function mia(req) {
  const cliente = await miCliente(req);
  const { rows: [m] } = await pool.query(
    `SELECT ${COLUMNAS}, m.trabajo_realizado, m.hallazgos, m.recomendaciones, m.detalle_inversion, m.comentario_cliente, m.costo_adicional
     ${DESDE} WHERE m.id = $1 AND i.cliente_id = $2 AND m.estado <> 'cancelada'`, [req.params.id, cliente]);
  if (!m) throw new ErrorHttp(404, 'Mantención no encontrada');
  return { cliente, m };
}

// Informe (030): fotos visibles con enlace firmado por 10 minutos
router.get('/:id', async (req, res) => {
  const { cliente, m } = await mia(req);
  const [docs, equipos, cotizacion] = await Promise.all([
    pool.query('SELECT id, tipo, nombre, storage_path FROM documentos WHERE mantencion_id = $1 AND visible_cliente ORDER BY created_at', [m.id]),
    pool.query('SELECT tipo, marca, modelo, motivo_retiro FROM equipos WHERE mantencion_retiro_id = $1', [m.id]),
    pool.query("SELECT id, estado FROM solicitudes WHERE cliente_id = $1 AND instalacion_id = $2 AND tipo = 'consulta' AND descripcion LIKE $3 ORDER BY id DESC LIMIT 1",
      [cliente, m.instalacion_id, `Cotización (MNT-${String(m.id).padStart(4, '0')})%`]),
  ]);
  const documentos = [];
  for (const d of docs.rows) {
    const { data } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 600);
    documentos.push({ id: d.id, tipo: d.tipo, nombre: d.nombre, url: data?.signedUrl ?? null });
  }
  res.json({ ...m, documentos, equipos_retirados: equipos.rows, cotizacion: cotizacion.rows[0] ?? null });
});

// Calificar (031): de 1 a 5 estrellas, una sola vez y solo si ya se realizó
router.post('/:id/calificar', async (req, res) => {
  const { m } = await mia(req);
  const nota = Number(req.body.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new ErrorHttp(400, 'Elige de 1 a 5 estrellas');
  if (m.estado !== 'realizada') throw new ErrorHttp(409, 'Podrás calificarla cuando se realice');
  const comentario = String(req.body.comentario || '').trim().slice(0, 500) || null;
  const { rowCount } = await pool.query(
    "UPDATE mantenciones SET calificacion_cliente = $2, comentario_cliente = $3 WHERE id = $1 AND estado = 'realizada' AND calificacion_cliente IS NULL",
    [m.id, nota, comentario]);
  if (!rowCount) throw new ErrorHttp(409, 'Ya calificaste esta mantención');
  res.json({ ok: true });
});

// Pedir cotización de la inversión recomendada: queda como solicitud para ENINTI
router.post('/:id/cotizacion', async (req, res) => {
  const { cliente, m } = await mia(req);
  if (!m.requiere_inversion) throw new ErrorHttp(409, 'Esta mantención no recomienda una inversión');
  const marca = `Cotización (MNT-${String(m.id).padStart(4, '0')})`;
  const { rowCount } = await pool.query(
    "SELECT 1 FROM solicitudes WHERE cliente_id = $1 AND descripcion LIKE $2 AND estado IN ('nueva', 'en_proceso')", [cliente, `${marca}%`]);
  if (rowCount) throw new ErrorHttp(409, 'Ya pediste esta cotización. Te contactaremos pronto.');
  const { rows: [s] } = await pool.query(
    `INSERT INTO solicitudes (cliente_id, instalacion_id, tipo, prioridad, descripcion, canal)
     VALUES ($1, $2, 'consulta', 'media', $3, 'plataforma') RETURNING id`,
    [cliente, m.instalacion_id, `${marca}: el cliente pide cotizar "${m.detalle_inversion}" para ${m.instalacion}.`]);
  res.status(201).json({ id: s.id });
});

export default router;
