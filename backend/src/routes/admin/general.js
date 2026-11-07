// T-20 · RNF-01: buscador global y contadores del menú del panel de administración
import { Router } from 'express';
import { pool } from '../../config/db.js';

const router = Router();

// Busca clientes (nombre, RUT, correo, teléfono), instalaciones (código, nombre, dirección) y suscripciones (código)
router.get('/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ clientes: [], instalaciones: [], suscripciones: [] });
  const patron = `%${q}%`;
  const rutLimpio = `%${q.replace(/[.\s]/g, '')}%`;
  const [clientes, instalaciones, suscripciones] = await Promise.all([
    pool.query(
      `SELECT c.id, c.nombre, c.rut, c.email, l.nombre AS localidad
       FROM clientes c LEFT JOIN localidades l ON l.id = c.localidad_id
       WHERE c.nombre ILIKE $1 OR c.rut ILIKE $2 OR c.email ILIKE $1 OR c.telefono ILIKE $1
       ORDER BY c.nombre LIMIT 6`,
      [patron, rutLimpio]
    ),
    pool.query(
      `SELECT i.id, i.codigo, i.nombre, i.direccion, c.nombre AS cliente
       FROM instalaciones i JOIN clientes c ON c.id = i.cliente_id
       WHERE i.codigo ILIKE $1 OR i.nombre ILIKE $1 OR i.direccion ILIKE $1
       ORDER BY i.codigo LIMIT 6`,
      [patron]
    ),
    pool.query(
      `SELECT s.id, s.codigo, s.estado, i.nombre AS instalacion, c.nombre AS cliente
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE s.codigo ILIKE $1
       ORDER BY s.fecha_inicio DESC LIMIT 6`,
      [patron]
    ),
  ]);
  res.json({ clientes: clientes.rows, instalaciones: instalaciones.rows, suscripciones: suscripciones.rows });
});

// Números que se muestran como insignias en el menú
router.get('/contadores', async (req, res) => {
  const { rows: [r] } = await pool.query(
    `SELECT (SELECT count(*) FROM pagos WHERE estado = 'pendiente')::int AS pagos_por_validar,
            (SELECT count(*) FROM solicitudes WHERE estado = 'nueva')::int AS solicitudes_nuevas,
            (SELECT count(*) FROM solicitudes WHERE estado = 'nueva' AND tipo = 'emergencia')::int AS emergencias`
  );
  res.json(r);
});

export default router;
