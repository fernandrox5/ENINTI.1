// T-35 · Reportes: tablero del negocio de mantenciones para el periodo elegido
// (últimos 6 o 12 meses, o desde la primera suscripción).
//   Mes a mes: lo esperado (planes vigentes), lo pagado de ese mes, planes nuevos y cancelados,
//              mantenciones a tiempo y cerradas tarde
//   Resumen:   ingreso mensual fijo, retención, nota de los clientes
//   Detalle:   medios de pago, cobros con tarjeta, calificaciones, técnicos, emergencias,
//              instalaciones sin plan (oportunidades) y motivos de cancelación
import { Router } from 'express';
import { pool } from '../../config/db.js';

const router = Router();

// Primer día del periodo pedido
async function desde(periodo) {
  if (periodo === 'todo') {
    const { rows } = await pool.query(
      "SELECT date_trunc('month', coalesce(min(fecha_inicio), fn_hoy()))::date AS d FROM suscripciones");
    return rows[0].d;
  }
  const meses = periodo === '12' ? 12 : 6;
  const { rows } = await pool.query("SELECT (date_trunc('month', fn_hoy()) - make_interval(months => $1 - 1))::date AS d", [meses]);
  return rows[0].d;
}

router.get('/', async (req, res) => {
  const periodo = ['6', '12', 'todo'].includes(req.query.periodo) ? req.query.periodo : '6';
  const inicio = await desde(periodo);

  const [meses, actual, base, medios, tarjeta, notas, tecnicos, emergencias, sinPlan, plan, motivos] = await Promise.all([
    pool.query(
      `WITH m AS (
         SELECT generate_series($1::date, date_trunc('month', fn_hoy())::date, interval '1 month')::date AS mes
       )
       SELECT to_char(m.mes, 'YYYY-MM') AS mes,
              (SELECT coalesce(sum(s.monto_pactado / fn_meses_periodo(s.frecuencia_pago)), 0) FROM suscripciones s
                WHERE s.fecha_inicio < m.mes + interval '1 month'
                  AND coalesce(s.fecha_cierre, s.fecha_termino) >= m.mes
                  AND coalesce(s.fecha_cierre, s.fecha_termino) > s.fecha_inicio)::int AS esperado,
              (SELECT coalesce(sum(p.monto), 0) FROM pagos p WHERE p.estado = 'pagado' AND p.periodo = m.mes)::int AS pagado,
              (SELECT count(*) FROM suscripciones s WHERE date_trunc('month', s.fecha_inicio) = m.mes)::int AS altas,
              (SELECT count(*) FROM suscripciones s WHERE s.estado = 'cerrada' AND date_trunc('month', s.fecha_cierre) = m.mes)::int AS bajas,
              (SELECT count(*) FROM mantenciones x WHERE x.estado = 'realizada' AND date_trunc('month', x.fecha_realizada) = m.mes
                 AND (x.fecha_programada IS NULL OR x.fecha_realizada <= x.fecha_programada))::int AS a_tiempo,
              (SELECT count(*) FROM mantenciones x WHERE x.estado = 'realizada' AND date_trunc('month', x.fecha_realizada) = m.mes
                 AND x.fecha_realizada > x.fecha_programada)::int AS tarde
       FROM m ORDER BY m.mes`, [inicio]),
    pool.query(
      `SELECT count(*)::int AS activos, coalesce(sum(monto_pactado / fn_meses_periodo(frecuencia_pago)), 0)::int AS ingreso_mensual
       FROM suscripciones WHERE estado = 'vigente'`),
    // Planes que ya estaban activos al comenzar el periodo (para la retención)
    pool.query(
      `SELECT count(*)::int AS n FROM suscripciones
       WHERE fecha_inicio < $1 AND coalesce(fecha_cierre, fecha_termino) >= $1`, [inicio]),
    pool.query(
      `SELECT medio_pago AS medio, count(*)::int AS n, coalesce(sum(monto), 0)::int AS monto FROM pagos
       WHERE estado = 'pagado' AND fecha_pago >= $1 GROUP BY medio_pago ORDER BY n DESC`, [inicio]),
    // Cada mes cobrado con tarjeta: al primer intento, con reintento, en proceso o no se pudo
    pool.query(
      `SELECT resultado, count(*)::int AS n FROM (
         SELECT CASE WHEN bool_or(estado = 'pagado' AND intento = 1) THEN 'primer'
                     WHEN bool_or(estado = 'pagado') THEN 'reintento'
                     WHEN bool_or(estado = 'pendiente') THEN 'en_proceso'
                     ELSE 'fallido' END AS resultado
         FROM cobros WHERE canal = 'tarjeta' AND created_at >= $1 GROUP BY suscripcion_id, periodo
       ) t GROUP BY resultado`, [inicio]),
    pool.query(
      `SELECT calificacion_cliente AS nota, count(*)::int AS n FROM mantenciones
       WHERE estado = 'realizada' AND calificacion_cliente IS NOT NULL AND fecha_realizada >= $1 GROUP BY 1`, [inicio]),
    pool.query(
      `SELECT t.id, t.nombre,
              count(*) FILTER (WHERE m.estado = 'realizada' AND m.fecha_realizada >= $1)::int AS visitas,
              count(*) FILTER (WHERE m.estado = 'realizada' AND m.fecha_realizada >= $1 AND m.fecha_realizada > m.fecha_programada)::int AS tarde,
              count(*) FILTER (WHERE m.estado = 'programada' AND m.fecha_programada < fn_hoy())::int AS sin_informe,
              round(avg(m.calificacion_cliente) FILTER (WHERE m.fecha_realizada >= $1), 1)::float AS nota
       FROM tecnicos t LEFT JOIN mantenciones m ON m.tecnico_id = t.id
       WHERE t.activo GROUP BY t.id, t.nombre ORDER BY visitas DESC, t.nombre`, [inicio]),
    pool.query(
      `SELECT count(*)::int AS n,
              round(avg(extract(epoch FROM atendida_at - created_at) / 3600) FILTER (WHERE atendida_at IS NOT NULL))::int AS horas
       FROM solicitudes WHERE tipo = 'emergencia' AND created_at >= $1`, [inicio]),
    pool.query(
      `SELECT v.instalacion_id, coalesce(v.instalacion_nombre, v.instalacion_codigo) AS instalacion, v.cliente_id, v.cliente_nombre AS cliente,
              v.cliente_telefono AS telefono, v.situacion, v.ultimo_motivo_cierre AS motivo, v.ultima_fecha_fin, i.potencia_kwp
       FROM v_instalaciones_sin_suscripcion v JOIN instalaciones i ON i.id = v.instalacion_id
       ORDER BY v.cantidad_suscripciones DESC, v.ultima_fecha_fin DESC NULLS LAST, v.instalacion_id`),
    // Plan más barato vigente: base para calcular lo que se podría ganar
    pool.query(
      `SELECT nombre, (monto_clp / fn_meses_periodo(frecuencia_pago))::int AS mensual FROM tipos_suscripcion
       WHERE activo ORDER BY monto_clp / fn_meses_periodo(frecuencia_pago) LIMIT 1`),
    pool.query(
      `SELECT regexp_replace(coalesce(motivo_cierre, 'Sin motivo'), '^Cancelada por el cliente:\\s*', '') AS motivo, count(*)::int AS n
       FROM suscripciones WHERE estado = 'cerrada' AND fecha_cierre >= $1 GROUP BY 1 ORDER BY n DESC, motivo`, [inicio]),
  ]);

  const filas = meses.rows;
  const altas = filas.reduce((a, m) => a + m.altas, 0);
  const bajas = filas.reduce((a, m) => a + m.bajas, 0);
  const totalNotas = notas.rows.reduce((a, r) => a + r.n, 0);
  const promedio = totalNotas ? notas.rows.reduce((a, r) => a + r.nota * r.n, 0) / totalNotas : null;
  const enJuego = base.rows[0].n + altas;

  res.json({
    periodo, desde: inicio,
    meses: filas,
    resumen: {
      ingreso_mensual: actual.rows[0].ingreso_mensual,
      ingreso_inicio: filas[0]?.esperado ?? 0,
      activos: actual.rows[0].activos,
      esperado: filas.reduce((a, m) => a + m.esperado, 0),
      pagado: filas.reduce((a, m) => a + m.pagado, 0),
      altas, bajas,
      retencion: enJuego ? Math.round(((enJuego - bajas) / enJuego) * 100) : null,
      nota: promedio === null ? null : Math.round(promedio * 10) / 10,
      opiniones: totalNotas,
    },
    medios: medios.rows,
    tarjeta: Object.fromEntries(tarjeta.rows.map((r) => [r.resultado, r.n])),
    calificaciones: [5, 4, 3, 2, 1].map((n) => ({ nota: n, n: notas.rows.find((r) => r.nota === n)?.n ?? 0 })),
    tecnicos: tecnicos.rows,
    emergencias: emergencias.rows[0],
    sin_plan: sinPlan.rows,
    plan_base: plan.rows[0] ?? null,
    motivos: motivos.rows,
  });
});

export default router;
