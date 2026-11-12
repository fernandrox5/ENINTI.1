// T-36 · Inicio del administrador (mockup 046): lo que pide atención hoy. Indicadores, visitas de
// hoy, pagos pendientes (corre el plazo de 7 días) y solicitudes nuevas.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { cobrosDelDia } from '../../services/cobros.js';
import { aRecuperar, porVencer, ultimasGestiones } from './seguimiento.js';

const router = Router();

router.get('/', async (req, res) => {
  const [indicadores, hoy, solicitudes, pendientes] = await Promise.all([
    pool.query(
      `SELECT (SELECT count(*) FROM suscripciones WHERE estado = 'vigente')::int AS vigentes,
              (SELECT coalesce(sum(monto_pactado / fn_meses_periodo(frecuencia_pago)), 0) FROM suscripciones WHERE estado = 'vigente')::int AS ingreso_mensual,
              (SELECT coalesce(sum(monto), 0) FROM pagos WHERE estado = 'pagado' AND fecha_pago >= date_trunc('month', now()))::int AS cobrado_mes,
              (SELECT count(*) FROM v_instalaciones_sin_suscripcion)::int AS sin_plan,
              (SELECT count(*) FROM mantenciones WHERE estado = 'programada' AND fecha_programada BETWEEN fn_hoy() AND fn_hoy() + 6)::int AS semana,
              (SELECT count(*) FROM mantenciones WHERE estado = 'programada' AND fecha_programada BETWEEN fn_hoy() AND fn_hoy() + 6 AND tecnico_id IS NULL)::int AS semana_sin_tecnico,
              (SELECT count(*) FROM mantenciones WHERE estado = 'programada' AND fecha_programada < fn_hoy())::int AS atrasadas,
              (SELECT count(*) FROM solicitudes WHERE estado = 'nueva')::int AS solicitudes_nuevas,
              (SELECT count(*) FROM solicitudes s WHERE s.estado IN ('nueva', 'en_proceso') AND s.tipo = 'emergencia'
                 AND NOT EXISTS (SELECT 1 FROM mantenciones m WHERE m.solicitud_id = s.id AND m.estado <> 'cancelada'))::int AS emergencias,
              (SELECT count(*) FROM pagos WHERE estado = 'pendiente')::int AS por_validar`),
    pool.query(
      `SELECT m.id, m.tipo, m.hora_inicio, coalesce(i.nombre, i.codigo) AS instalacion, c.nombre AS cliente, t.nombre AS tecnico
       FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       LEFT JOIN tecnicos t ON t.id = m.tecnico_id
       WHERE m.estado = 'programada' AND m.fecha_programada = fn_hoy() ORDER BY m.hora_inicio NULLS LAST`),
    pool.query(
      `SELECT s.id, s.tipo, s.created_at, c.nombre AS cliente, coalesce(i.nombre, i.codigo) AS instalacion
       FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id LEFT JOIN instalaciones i ON i.id = s.instalacion_id
       WHERE s.estado = 'nueva' ORDER BY (s.tipo = 'emergencia') DESC, s.created_at LIMIT 5`),
    cobrosDelDia(),
  ]);
  // Pago pendiente: el mes en curso sin pagar (con tarjeta, el día del cobro aún no cuenta)
  const pagos = pendientes.filter((r) => !(r.tarjeta_id && r.dias_pendiente === 0) && r.accion !== 'cerrar')
    .sort((a, b) => a.quedan_dias - b.quedan_dias)
    .map((r) => ({ suscripcion_id: r.id, cliente_id: r.cliente_id, cliente: r.cliente, telefono: r.telefono, instalacion: r.instalacion, monto: r.monto_pactado, quedan_dias: r.quedan_dias }));
  const { rows: [p] } = await pool.query('SELECT nombre FROM perfiles WHERE id = $1', [req.usuario.id]);

  // Para llamar hoy: a quién conviene escribir y por qué
  const [vencer, recuperar] = await Promise.all([porVencer(), aRecuperar()]);
  const llamar = [
    ...pagos.map((r) => ({ clave: `pago-${r.suscripcion_id}`, motivo: 'pago', cliente_id: r.cliente_id, cliente: r.cliente, telefono: r.telefono, instalacion: r.instalacion,
      suscripcion_id: r.suscripcion_id, dias: r.quedan_dias, detalle: r.quedan_dias === 0 ? 'Pago pendiente · último día' : `Pago pendiente · quedan ${r.quedan_dias} ${r.quedan_dias === 1 ? 'día' : 'días'}` })),
    ...vencer.filter((v) => !v.renovada && v.dias_restantes <= 15).map((v) => ({ clave: `vence-${v.suscripcion_id}`, motivo: 'vence', cliente_id: v.cliente_id, cliente: v.cliente, telefono: v.telefono,
      instalacion: v.instalacion, suscripcion_id: v.suscripcion_id, dias: v.dias_restantes, detalle: v.dias_restantes <= 0 ? 'Su suscripción vence hoy' : `Su suscripción vence en ${v.dias_restantes} ${v.dias_restantes === 1 ? 'día' : 'días'}` })),
    ...recuperar.filter((r) => r.situacion !== 'nunca suscrita' && r.dias_sin_cobertura !== null && r.dias_sin_cobertura <= 7).map((r) => ({ clave: `cerrada-${r.instalacion_id}`, motivo: 'cerrada',
      cliente_id: r.cliente_id, cliente: r.cliente, telefono: r.telefono, instalacion: r.instalacion, suscripcion_id: null, dias: r.dias_sin_cobertura,
      detalle: r.ultimo_motivo_cierre === 'Falta de pago' ? 'Suscripción cerrada por falta de pago' : r.ultimo_motivo_cierre ? `No renovó · ${r.ultimo_motivo_cierre.toLowerCase()}` : 'No renovó su suscripción' })),
  ];
  const gestiones = await ultimasGestiones([...new Set(llamar.map((x) => x.cliente_id))]);
  const para_llamar = llamar.map((x) => ({ ...x, ultima_gestion: gestiones[x.cliente_id] ?? null }));
  res.json({ nombre: p?.nombre ?? '', ...indicadores.rows[0], pagos_pendientes: pagos, para_llamar, hoy: hoy.rows, solicitudes: solicitudes.rows });
});

export default router;
