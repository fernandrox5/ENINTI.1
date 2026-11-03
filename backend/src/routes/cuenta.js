// Mi cuenta del cliente
//   RF-10 · HU-8  meses pagados y deuda vigente
//   RF-14 · HU-8  historial completo de pagos
import { Router } from 'express';
import { pool } from '../config/db.js';
import { generarCuotas } from '../services/cuotas.js';

const router = Router();

// Resumen por instalación del cliente que inició sesión
router.get('/resumen', async (req, res) => {
  await generarCuotas();
  const { rows } = await pool.query(
    `SELECT i.id AS instalacion_id, i.direccion, co.nombre AS comuna,
            s.id AS suscripcion_id, s.cuota_mensual, s.fecha_inicio,
            COUNT(c.id) FILTER (WHERE c.estado = 'pagada')::int AS meses_pagados,
            COUNT(c.id) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE)::int AS meses_adeudados,
            COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE), 0)::int AS deuda,
            MIN(c.fecha_vencimiento) FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento >= CURRENT_DATE) AS proximo_vencimiento
     FROM cliente cl
     JOIN instalacion i ON i.cliente_id = cl.id
     JOIN comuna co ON co.id = i.comuna_id
     JOIN suscripcion s ON s.instalacion_id = i.id AND s.estado = 'activa'
     LEFT JOIN cuota c ON c.suscripcion_id = s.id
     WHERE cl.usuario_id = $1
     GROUP BY i.id, co.nombre, s.id
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

export default router;
