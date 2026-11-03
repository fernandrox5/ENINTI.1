// Mi cuenta del cliente
//   RF-10 · HU-8   meses pagados y deuda vigente
//   RF-14 · HU-8   historial completo de pagos
//   RF-13 · HU-10  ficha técnica de la instalación
//   RF-19 · HU-7   aceptación de condiciones
//   RF-09 · HU-7   medio de pago en ambiente de pruebas
//   RF-16 · HU-12  cancelación de la suscripción
import { Router } from 'express';
import { pool } from '../config/db.js';
import { CONDICIONES } from '../config/condiciones.js';
import { generarCuotas } from '../services/cuotas.js';
import { pasarela } from '../services/pasarela.js';
import { ErrorHttp } from '../utils/validar.js';

const router = Router();
const FRONT = process.env.FRONT_URL || 'http://localhost:5173';

async function clienteDe(usuarioId) {
  const { rows: [c] } = await pool.query('SELECT id, nombre, correo FROM cliente WHERE usuario_id = $1', [usuarioId]);
  if (!c) throw new ErrorHttp(404, 'Tu cuenta no tiene una ficha de cliente asociada');
  return c;
}

async function aceptoCondiciones(usuarioId) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM aceptacion_condiciones WHERE usuario_id = $1 AND version = $2',
    [usuarioId, CONDICIONES.version]
  );
  return rowCount > 0;
}

// Resumen por instalación: se usa la suscripción más reciente de cada una.
// Una suscripción cancelada se sigue mostrando mientras tenga deuda.
router.get('/resumen', async (req, res) => {
  await generarCuotas();
  const { rows } = await pool.query(
    `WITH ultima AS (
       SELECT DISTINCT ON (s.instalacion_id) s.*
       FROM suscripcion s ORDER BY s.instalacion_id, s.fecha_inicio DESC, s.id DESC
     )
     SELECT i.id AS instalacion_id, i.direccion, co.nombre AS comuna,
            s.id AS suscripcion_id, s.estado, s.cuota_mensual, s.fecha_inicio, s.fecha_cancelacion,
            COUNT(c.id) FILTER (WHERE c.estado = 'pagada')::int AS meses_pagados,
            COUNT(c.id) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE)::int AS meses_adeudados,
            COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE), 0)::int AS deuda,
            MIN(c.fecha_vencimiento) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento >= CURRENT_DATE) AS proximo_vencimiento
     FROM cliente cl
     JOIN instalacion i ON i.cliente_id = cl.id
     JOIN comuna co ON co.id = i.comuna_id
     JOIN ultima s ON s.instalacion_id = i.id
     LEFT JOIN cuota c ON c.suscripcion_id = s.id
     WHERE cl.usuario_id = $1
     GROUP BY i.id, co.nombre, s.id, s.estado, s.cuota_mensual, s.fecha_inicio, s.fecha_cancelacion
     HAVING s.estado = 'activa'
         OR COUNT(c.id) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE) > 0
     ORDER BY i.id`,
    [req.usuario.id]
  );
  res.json(rows);
});

router.get('/pagos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.fecha_pago, c.periodo, p.monto, p.medio, i.direccion
     FROM pago p
     JOIN cuota c ON c.id = p.cuota_id
     JOIN suscripcion s ON s.id = c.suscripcion_id
     JOIN instalacion i ON i.id = s.instalacion_id
     JOIN cliente cl ON cl.id = i.cliente_id
     WHERE cl.usuario_id = $1 AND p.estado = 'aprobado'
     ORDER BY p.fecha_pago DESC, c.periodo DESC`,
    [req.usuario.id]
  );
  res.json(rows);
});

// RF-13: ficha técnica de una instalación propia
router.get('/instalaciones/:id', async (req, res) => {
  const { rows: [ficha] } = await pool.query(
    `SELECT i.id, i.direccion, i.referencia, co.nombre AS comuna, i.potencia_kw, i.inversor, i.paneles,
            i.cantidad_paneles, i.baterias, i.fecha_instalacion,
            s.id AS suscripcion_id, s.fecha_inicio, s.cuota_mensual, s.dia_cobro, s.mantenciones_anuales
     FROM instalacion i
     JOIN cliente cl ON cl.id = i.cliente_id
     JOIN comuna co ON co.id = i.comuna_id
     LEFT JOIN suscripcion s ON s.instalacion_id = i.id AND s.estado = 'activa'
     WHERE i.id = $1 AND cl.usuario_id = $2`,
    [req.params.id, req.usuario.id]
  );
  if (!ficha) throw new ErrorHttp(404, 'Instalación no encontrada');
  res.json(ficha);
});

// RF-16: cancelar la suscripción en un paso (más la confirmación en pantalla).
// Las cuotas vencidas siguen como deuda; la cuota del mes que aún no vence se elimina.
router.post('/suscripciones/:id/cancelar', async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [s] } = await db.query(
      `UPDATE suscripcion s SET estado = 'cancelada', fecha_cancelacion = CURRENT_DATE
       FROM instalacion i JOIN cliente cl ON cl.id = i.cliente_id
       WHERE s.id = $1 AND s.instalacion_id = i.id AND cl.usuario_id = $2 AND s.estado = 'activa'
       RETURNING s.id, s.fecha_cancelacion`,
      [req.params.id, req.usuario.id]
    );
    if (!s) throw new ErrorHttp(404, 'No se encontró una suscripción activa para cancelar');
    await db.query(
      `DELETE FROM cuota WHERE suscripcion_id = $1 AND estado = 'pendiente' AND fecha_vencimiento >= CURRENT_DATE`,
      [s.id]
    );
    await db.query(
      `UPDATE mantencion SET estado = 'cancelada'
       WHERE instalacion_id = (SELECT instalacion_id FROM suscripcion WHERE id = $1)
         AND estado = 'programada' AND fecha_programada >= CURRENT_DATE`,
      [s.id]
    );
    await db.query('COMMIT');
    res.json(s);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// RF-19: condiciones del servicio
router.get('/condiciones', async (req, res) => {
  res.json({ ...CONDICIONES, aceptada: await aceptoCondiciones(req.usuario.id) });
});

router.post('/condiciones', async (req, res) => {
  if (!(await aceptoCondiciones(req.usuario.id))) {
    await pool.query('INSERT INTO aceptacion_condiciones (usuario_id, version) VALUES ($1, $2)', [req.usuario.id, CONDICIONES.version]);
  }
  res.status(201).json({ aceptada: true });
});

// RF-09: medio de pago
router.get('/medio-pago', async (req, res) => {
  const cliente = await clienteDe(req.usuario.id);
  const { rows: [medio] } = await pool.query(
    'SELECT id, pasarela, tipo_tarjeta, ultimos_digitos, creado_en FROM medio_pago WHERE cliente_id = $1 AND activo',
    [cliente.id]
  );
  res.json({ medio: medio || null, pasarela: pasarela.nombre, condiciones_aceptadas: await aceptoCondiciones(req.usuario.id) });
});

router.post('/medio-pago/inscripcion', async (req, res) => {
  if (!(await aceptoCondiciones(req.usuario.id))) {
    throw new ErrorHttp(409, 'Debes aceptar las condiciones del servicio antes de inscribir un medio de pago');
  }
  const cliente = await clienteDe(req.usuario.id);
  const { token, url } = await pasarela.iniciar({
    usuario: `cliente-${cliente.id}`,
    correo: cliente.correo || `cliente-${cliente.id}@eninti.cl`,
    urlRetorno: `${FRONT}/api/pasarela/retorno`,
  });
  // Se guarda como pendiente hasta que la pasarela confirme
  await pool.query(
    'INSERT INTO medio_pago (cliente_id, pasarela, token_pasarela, activo) VALUES ($1, $2, $3, FALSE)',
    [cliente.id, pasarela.modo, token]
  );
  res.status(201).json({ token, url });
});

router.delete('/medio-pago', async (req, res) => {
  const cliente = await clienteDe(req.usuario.id);
  const { rows: [medio] } = await pool.query(
    'SELECT id, token_pasarela, pasarela FROM medio_pago WHERE cliente_id = $1 AND activo',
    [cliente.id]
  );
  if (!medio) throw new ErrorHttp(404, 'No tienes un medio de pago inscrito');
  if (medio.pasarela === pasarela.modo) {
    await pasarela.eliminar({ tokenPasarela: medio.token_pasarela, usuario: `cliente-${cliente.id}` }).catch((err) =>
      console.error('No se pudo eliminar en la pasarela:', err.message));
  }
  await pool.query('UPDATE medio_pago SET activo = FALSE WHERE id = $1', [medio.id]);
  res.json({ ok: true });
});

export default router;
