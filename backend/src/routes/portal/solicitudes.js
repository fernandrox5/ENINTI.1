// T-29 · Portal del cliente (mockups 034 a 037): sus solicitudes, con la respuesta de ENINTI y la
// mantención agendada, y nueva solicitud (mantención, emergencia o consulta) para cualquiera de
// sus instalaciones, tenga o no suscripción.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';

const router = Router();
const TIPOS = ['mantencion', 'emergencia', 'consulta'];
const PRIORIDAD = { emergencia: 'alta', mantencion: 'media', consulta: 'baja' };

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Solicitud no encontrada'))));

async function miCliente(req) {
  const { rows: [c] } = await pool.query('SELECT id FROM clientes WHERE perfil_id = $1', [req.usuario.id]);
  if (!c) throw new ErrorHttp(404, 'Tu cuenta no está asociada a un cliente. Escríbenos para revisarlo.');
  return c.id;
}

const COLUMNAS = `s.id, s.tipo, s.descripcion, s.canal, s.estado, s.respuesta, s.created_at, s.updated_at,
  i.id AS instalacion_id, coalesce(i.nombre, i.codigo) AS instalacion,
  (SELECT row_to_json(x) FROM (SELECT m.id, m.estado, m.fecha_programada, m.fecha_realizada, m.hora_inicio, t.nombre AS tecnico
     FROM mantenciones m LEFT JOIN tecnicos t ON t.id = m.tecnico_id WHERE m.solicitud_id = s.id AND m.estado <> 'cancelada'
     ORDER BY m.id DESC LIMIT 1) x) AS mantencion`;

router.get('/', async (req, res) => {
  const cliente = await miCliente(req);
  const [lista, instalaciones] = await Promise.all([
    pool.query(`SELECT ${COLUMNAS} FROM solicitudes s LEFT JOIN instalaciones i ON i.id = s.instalacion_id
                WHERE s.cliente_id = $1 ORDER BY s.estado IN ('nueva', 'en_proceso') DESC, s.created_at DESC LIMIT 100`, [cliente]),
    pool.query(
      `SELECT i.id, coalesce(i.nombre, i.codigo) AS nombre, EXISTS (SELECT 1 FROM suscripciones s WHERE s.instalacion_id = i.id AND s.estado = 'vigente') AS con_plan
       FROM instalaciones i WHERE i.cliente_id = $1 AND i.activa ORDER BY i.codigo`, [cliente]),
  ]);
  res.json({ solicitudes: lista.rows, instalaciones: instalaciones.rows });
});

router.get('/:id', async (req, res) => {
  const cliente = await miCliente(req);
  const { rows: [s] } = await pool.query(
    `SELECT ${COLUMNAS} FROM solicitudes s LEFT JOIN instalaciones i ON i.id = s.instalacion_id WHERE s.id = $1 AND s.cliente_id = $2`,
    [req.params.id, cliente]);
  if (!s) throw new ErrorHttp(404, 'Solicitud no encontrada');
  res.json(s);
});

router.post('/', async (req, res) => {
  const cliente = await miCliente(req);
  const tipo = req.body.tipo;
  if (!TIPOS.includes(tipo)) throw new ErrorHttp(400, 'Elige el tipo de solicitud');
  const descripcion = String(req.body.descripcion || '').trim().slice(0, 2000);
  if (descripcion.length < 5) throw new ErrorHttp(400, 'Cuéntanos qué necesitas');
  const { rows: [i] } = await pool.query('SELECT id FROM instalaciones WHERE id = $1 AND cliente_id = $2 AND activa', [Number(req.body.instalacion_id) || 0, cliente]);
  if (!i && tipo !== 'consulta') throw new ErrorHttp(400, 'Elige la instalación');
  // Evita duplicar la misma emergencia por doble clic
  const { rowCount } = await pool.query(
    "SELECT 1 FROM solicitudes WHERE cliente_id = $1 AND descripcion = $2 AND created_at > now() - interval '10 minutes'", [cliente, descripcion]);
  if (rowCount) throw new ErrorHttp(409, 'Ya recibimos esta solicitud. Te contactaremos pronto.');
  const { rows: [s] } = await pool.query(
    `INSERT INTO solicitudes (cliente_id, instalacion_id, tipo, prioridad, descripcion, canal)
     VALUES ($1, $2, $3, $4, $5, 'plataforma') RETURNING id`,
    [cliente, i?.id ?? null, tipo, PRIORIDAD[tipo], descripcion]);
  res.status(201).json({ id: s.id });
});

export default router;
