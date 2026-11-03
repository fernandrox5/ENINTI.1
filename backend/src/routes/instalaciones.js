// RF-02 · HU-3: administrar instalaciones, su ficha técnica y su suscripción
import { Router } from 'express';
import { pool } from '../config/db.js';
import { generarCuotas } from '../services/cuotas.js';
import { ErrorHttp } from '../utils/validar.js';

const router = Router();

const CAMPOS = ['cliente_id', 'comuna_id', 'direccion', 'referencia', 'latitud', 'longitud', 'potencia_kw',
  'inversor', 'paneles', 'cantidad_paneles', 'baterias', 'fecha_instalacion'];

function datosInstalacion(body) {
  if (!body.cliente_id) throw new ErrorHttp(400, 'Selecciona el cliente');
  if (!body.comuna_id) throw new ErrorHttp(400, 'Selecciona la comuna');
  if (!body.direccion?.trim()) throw new ErrorHttp(400, 'La dirección es obligatoria');
  return CAMPOS.map((c) => (body[c] === '' || body[c] === undefined ? null : body[c]));
}

router.get('/comunas', async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre FROM comuna ORDER BY id');
  res.json(rows);
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.id, i.direccion, co.nombre AS comuna, i.potencia_kw, i.fecha_instalacion,
            cl.id AS cliente_id, cl.nombre AS cliente, s.estado AS suscripcion
     FROM instalacion i
     JOIN cliente cl ON cl.id = i.cliente_id
     JOIN comuna co ON co.id = i.comuna_id
     LEFT JOIN suscripcion s ON s.instalacion_id = i.id AND s.estado = 'activa'
     ORDER BY cl.nombre, i.id`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows: [instalacion] } = await pool.query(
    `SELECT i.*, cl.nombre AS cliente, co.nombre AS comuna,
            s.id AS suscripcion_id, s.fecha_inicio, s.cuota_mensual, s.dia_cobro, s.estado AS suscripcion
     FROM instalacion i
     JOIN cliente cl ON cl.id = i.cliente_id
     JOIN comuna co ON co.id = i.comuna_id
     LEFT JOIN suscripcion s ON s.instalacion_id = i.id AND s.estado = 'activa'
     WHERE i.id = $1`,
    [req.params.id]
  );
  if (!instalacion) throw new ErrorHttp(404, 'Instalación no encontrada');
  res.json(instalacion);
});

// Crea la instalación y, si se indica, su suscripción (una por instalación)
router.post('/', async (req, res) => {
  const valores = datosInstalacion(req.body);
  const { con_suscripcion = true, fecha_inicio, dia_cobro } = req.body;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [instalacion] } = await db.query(
      `INSERT INTO instalacion (${CAMPOS.join(', ')})
       VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      valores
    );
    if (con_suscripcion) {
      await db.query(
        `INSERT INTO suscripcion (instalacion_id, fecha_inicio, dia_cobro)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), COALESCE($3::int, 5))`,
        [instalacion.id, fecha_inicio || null, dia_cobro || null]
      );
      await generarCuotas(db);
    }
    await db.query('COMMIT');
    res.status(201).json(instalacion);
  } catch (err) {
    await db.query('ROLLBACK');
    if (err.code === '23503') throw new ErrorHttp(400, 'El cliente o la comuna no existen');
    throw err;
  } finally {
    db.release();
  }
});

router.put('/:id', async (req, res) => {
  const valores = datosInstalacion(req.body);
  const { rowCount } = await pool.query(
    `UPDATE instalacion SET ${CAMPOS.map((c, i) => `${c} = $${i + 1}`).join(', ')}
     WHERE id = $${CAMPOS.length + 1}`,
    [...valores, req.params.id]
  );
  if (!rowCount) throw new ErrorHttp(404, 'Instalación no encontrada');
  res.json({ ok: true });
});

export default router;
