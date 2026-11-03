// RF-02 · HU-3: administrar clientes
import { Router } from 'express';
import { pool } from '../config/db.js';
import { normalizarRut, correoValido, ErrorHttp } from '../utils/validar.js';

const router = Router();

function validarCliente({ rut, nombre, correo }) {
  const rutNormal = normalizarRut(rut);
  if (!rutNormal) throw new ErrorHttp(400, 'El RUT no es válido');
  if (!nombre?.trim()) throw new ErrorHttp(400, 'El nombre es obligatorio');
  if (correo && !correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  return rutNormal;
}

// Listado con búsqueda por nombre o RUT
router.get('/', async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT c.id, c.rut, c.nombre, c.correo, c.telefono, c.direccion,
            (c.usuario_id IS NOT NULL) AS registrado,
            COUNT(i.id)::int AS instalaciones
     FROM cliente c LEFT JOIN instalacion i ON i.cliente_id = c.id
     WHERE c.nombre ILIKE $1 OR c.rut ILIKE $1
     GROUP BY c.id ORDER BY c.nombre`,
    [q]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows: [cliente] } = await pool.query(
    'SELECT id, rut, nombre, correo, telefono, direccion, (usuario_id IS NOT NULL) AS registrado FROM cliente WHERE id = $1',
    [req.params.id]
  );
  if (!cliente) throw new ErrorHttp(404, 'Cliente no encontrado');
  const { rows: instalaciones } = await pool.query(
    `SELECT i.id, i.direccion, co.nombre AS comuna, i.potencia_kw, s.estado AS suscripcion
     FROM instalacion i JOIN comuna co ON co.id = i.comuna_id
     LEFT JOIN suscripcion s ON s.instalacion_id = i.id AND s.estado = 'activa'
     WHERE i.cliente_id = $1 ORDER BY i.id`,
    [req.params.id]
  );
  res.json({ ...cliente, instalaciones });
});

router.post('/', async (req, res) => {
  const rut = validarCliente(req.body);
  const { nombre, correo, telefono, direccion } = req.body;
  try {
    const { rows: [cliente] } = await pool.query(
      `INSERT INTO cliente (rut, nombre, correo, telefono, direccion)
       VALUES ($1, $2, lower($3), $4, $5) RETURNING id`,
      [rut, nombre.trim(), correo || null, telefono || null, direccion || null]
    );
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === '23505') throw new ErrorHttp(409, 'Ya existe un cliente con ese RUT');
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const rut = validarCliente(req.body);
  const { nombre, correo, telefono, direccion } = req.body;
  try {
    const { rowCount } = await pool.query(
      `UPDATE cliente SET rut = $1, nombre = $2, correo = lower($3), telefono = $4, direccion = $5 WHERE id = $6`,
      [rut, nombre.trim(), correo || null, telefono || null, direccion || null, req.params.id]
    );
    if (!rowCount) throw new ErrorHttp(404, 'Cliente no encontrado');
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') throw new ErrorHttp(409, 'Ya existe un cliente con ese RUT');
    throw err;
  }
});

export default router;
