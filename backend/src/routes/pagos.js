// Sprint 2 · control de pagos del administrador
//   RF-01 · HU-1  suscripciones impagas
//   RF-05 · HU-2  registro manual de pagos
//   RF-04 · HU-6  listado mensual y exportación
import { Router } from 'express';
import { pool } from '../config/db.js';
import { generarCuotas } from '../services/cuotas.js';
import { ErrorHttp } from '../utils/validar.js';

const router = Router();

// RF-01: suscripciones con cuotas vencidas sin pagar
router.get('/impagos', async (req, res) => {
  await generarCuotas();
  const { rows } = await pool.query(
    `SELECT s.id AS suscripcion_id, cl.id AS cliente_id, cl.nombre AS cliente, cl.rut, cl.telefono,
            i.id AS instalacion_id, i.direccion, co.nombre AS comuna,
            COUNT(c.id)::int AS meses_adeudados,
            SUM(c.monto)::int AS monto_adeudado,
            MIN(c.periodo) AS desde
     FROM cuota c
     JOIN suscripcion s ON s.id = c.suscripcion_id AND s.estado = 'activa'
     JOIN instalacion i ON i.id = s.instalacion_id
     JOIN cliente cl ON cl.id = i.cliente_id
     JOIN comuna co ON co.id = i.comuna_id
     WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE
     GROUP BY s.id, cl.id, i.id, co.nombre
     ORDER BY meses_adeudados DESC, monto_adeudado DESC`
  );
  res.json(rows);
});

// Cuotas pendientes de una suscripción (para el formulario de pago manual)
router.get('/suscripciones/:id/pendientes', async (req, res) => {
  await generarCuotas();
  const { rows } = await pool.query(
    `SELECT id, periodo, monto, fecha_vencimiento, (fecha_vencimiento < CURRENT_DATE) AS vencida
     FROM cuota WHERE suscripcion_id = $1 AND estado = 'pendiente' ORDER BY periodo`,
    [req.params.id]
  );
  res.json(rows);
});

// RF-05: registrar un pago por transferencia o efectivo. Paga las cuotas indicadas.
router.post('/manual', async (req, res) => {
  const { cuotas, medio, fecha_pago, referencia } = req.body;
  if (!Array.isArray(cuotas) || cuotas.length === 0) throw new ErrorHttp(400, 'Selecciona al menos una cuota');
  if (!['transferencia', 'efectivo'].includes(medio)) throw new ErrorHttp(400, 'El medio debe ser transferencia o efectivo');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: pendientes } = await db.query(
      `SELECT id, monto FROM cuota WHERE id = ANY($1::int[]) AND estado = 'pendiente' FOR UPDATE`,
      [cuotas]
    );
    if (pendientes.length !== cuotas.length) throw new ErrorHttp(409, 'Alguna de las cuotas ya estaba pagada');

    for (const cuota of pendientes) {
      await db.query(
        `INSERT INTO pago (cuota_id, monto, fecha_pago, medio, origen, referencia, registrado_por)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, 'manual', $5, $6)`,
        [cuota.id, cuota.monto, fecha_pago || null, medio, referencia || null, req.usuario.id]
      );
    }
    await db.query(`UPDATE cuota SET estado = 'pagada' WHERE id = ANY($1::int[])`, [cuotas]);
    await db.query('COMMIT');
    const total = pendientes.reduce((s, c) => s + c.monto, 0);
    res.status(201).json({ cuotas_pagadas: pendientes.length, total });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// RF-04: pagos recibidos en un mes (?mes=AAAA-MM)
async function pagosDelMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new ErrorHttp(400, 'Indica el mes con formato AAAA-MM');
  const { rows } = await pool.query(
    `SELECT p.id, p.fecha_pago, cl.nombre AS cliente, cl.rut, i.direccion, co.nombre AS comuna,
            c.periodo, p.monto, p.medio, p.origen, p.referencia
     FROM pago p
     JOIN cuota c ON c.id = p.cuota_id
     JOIN suscripcion s ON s.id = c.suscripcion_id
     JOIN instalacion i ON i.id = s.instalacion_id
     JOIN cliente cl ON cl.id = i.cliente_id
     JOIN comuna co ON co.id = i.comuna_id
     WHERE p.estado = 'aprobado' AND date_trunc('month', p.fecha_pago) = ($1 || '-01')::date
     ORDER BY p.fecha_pago, cl.nombre`,
    [mes]
  );
  return rows;
}

router.get('/mensual', async (req, res) => {
  const pagos = await pagosDelMes(req.query.mes);
  res.json({ pagos, total: pagos.reduce((s, p) => s + p.monto, 0) });
});

// Exportación CSV compatible con Excel (separador ; y BOM UTF-8)
router.get('/mensual.csv', async (req, res) => {
  const pagos = await pagosDelMes(req.query.mes);
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [
    ['Fecha de pago', 'Cliente', 'RUT', 'Dirección', 'Comuna', 'Mes pagado', 'Monto', 'Medio', 'Referencia'],
    ...pagos.map((p) => [p.fecha_pago, p.cliente, p.rut, p.direccion, p.comuna,
      p.periodo.slice(0, 7), p.monto, p.medio, p.referencia]),
    ['', '', '', '', '', 'Total', pagos.reduce((s, p) => s + p.monto, 0), '', ''],
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pagos-${req.query.mes}.csv"`);
  res.send('﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n'));
});

export default router;
