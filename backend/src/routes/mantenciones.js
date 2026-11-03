// RF-03 · HU-4: calendario de mantenciones por comuna, incluye asignar técnico
import { Router } from 'express';
import { pool } from '../config/db.js';
import { ErrorHttp } from '../utils/validar.js';

const router = Router();
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '');

// Técnicos activos para asignar
router.get('/tecnicos', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, nombre FROM usuario WHERE rol = 'tecnico' AND activo ORDER BY nombre"
  );
  res.json(rows);
});

// Mantenciones en un rango de fechas, opcionalmente de una comuna
router.get('/', async (req, res) => {
  const { desde, hasta, comuna_id } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorHttp(400, 'Indica el rango de fechas');
  if (desde > hasta) throw new ErrorHttp(400, 'La fecha de inicio debe ser anterior a la de término');
  const { rows } = await pool.query(
    `SELECT m.id, m.fecha_programada, m.tipo, m.estado, m.tecnico_id, t.nombre AS tecnico,
            i.id AS instalacion_id, i.direccion, co.id AS comuna_id, co.nombre AS comuna,
            cl.nombre AS cliente, cl.telefono
     FROM mantencion m
     JOIN instalacion i ON i.id = m.instalacion_id
     JOIN comuna co ON co.id = i.comuna_id
     JOIN cliente cl ON cl.id = i.cliente_id
     LEFT JOIN usuario t ON t.id = m.tecnico_id
     WHERE m.fecha_programada BETWEEN $1 AND $2
       AND ($3::int IS NULL OR co.id = $3::int)
       AND m.estado <> 'cancelada'
     ORDER BY co.nombre, m.fecha_programada, cl.nombre`,
    [desde, hasta, comuna_id || null]
  );
  res.json(rows);
});

async function validarTecnico(tecnicoId) {
  if (!tecnicoId) return null;
  const { rowCount } = await pool.query("SELECT 1 FROM usuario WHERE id = $1 AND rol = 'tecnico' AND activo", [tecnicoId]);
  if (!rowCount) throw new ErrorHttp(400, 'El técnico seleccionado no es válido');
  return tecnicoId;
}

// Programar una mantención (solo instalaciones con suscripción activa)
router.post('/', async (req, res) => {
  const { instalacion_id, fecha_programada, tipo = 'preventiva', tecnico_id } = req.body;
  if (!instalacion_id) throw new ErrorHttp(400, 'Selecciona la instalación');
  if (!fechaValida(fecha_programada)) throw new ErrorHttp(400, 'Indica la fecha de la mantención');
  if (!['preventiva', 'correctiva'].includes(tipo)) throw new ErrorHttp(400, 'Tipo de mantención no válido');
  const { rowCount } = await pool.query(
    "SELECT 1 FROM suscripcion WHERE instalacion_id = $1 AND estado = 'activa'", [instalacion_id]
  );
  if (!rowCount) throw new ErrorHttp(400, 'La instalación no tiene una suscripción activa');
  const { rows: [m] } = await pool.query(
    `INSERT INTO mantencion (instalacion_id, fecha_programada, tipo, tecnico_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [instalacion_id, fecha_programada, tipo, await validarTecnico(tecnico_id)]
  );
  res.status(201).json(m);
});

// Reprogramar, asignar técnico o cancelar una mantención que aún no se ejecuta
router.put('/:id', async (req, res) => {
  const { fecha_programada, tecnico_id, estado } = req.body;
  if (fecha_programada !== undefined && !fechaValida(fecha_programada)) throw new ErrorHttp(400, 'Fecha no válida');
  if (estado !== undefined && estado !== 'cancelada') throw new ErrorHttp(400, 'Solo se puede cancelar desde aquí');
  const tecnico = tecnico_id === undefined ? undefined : await validarTecnico(tecnico_id);
  const { rowCount } = await pool.query(
    `UPDATE mantencion SET
       fecha_programada = COALESCE($1::date, fecha_programada),
       tecnico_id = CASE WHEN $2::boolean THEN $3::int ELSE tecnico_id END,
       estado = COALESCE($4, estado)
     WHERE id = $5 AND estado = 'programada'`,
    [fecha_programada || null, tecnico !== undefined, tecnico ?? null, estado || null, req.params.id]
  );
  if (!rowCount) throw new ErrorHttp(404, 'La mantención no existe o ya no se puede modificar');
  res.json({ ok: true });
});

export default router;
