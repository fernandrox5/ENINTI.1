import { pool } from '../config/db.js';

// Genera las cuotas mensuales que falten para cada suscripción activa,
// desde el mes de inicio hasta el mes actual. Es idempotente.
export async function generarCuotas(db = pool) {
  const { rowCount } = await db.query(`
    INSERT INTO cuota (suscripcion_id, periodo, monto, fecha_vencimiento)
    SELECT s.id, p::date, s.cuota_mensual, (p + (s.dia_cobro - 1) * INTERVAL '1 day')::date
    FROM suscripcion s,
         generate_series(date_trunc('month', s.fecha_inicio), date_trunc('month', CURRENT_DATE), INTERVAL '1 month') p
    WHERE s.estado = 'activa'
    ON CONFLICT (suscripcion_id, periodo) DO NOTHING
  `);
  return rowCount;
}
