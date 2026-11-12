// Notificaciones de la campana del administrador: lo que pasó en los últimos 30 días
// (emergencias y pedidos, pagos por revisar, pagos en línea, cobros rechazados, planes contratados
// y cerrados, informes de visitas, calificaciones y cuentas activadas). Cada una lleva a su pantalla.
// Lo leído se guarda en el navegador de cada administrador.
import { Router } from 'express';
import { pool } from '../../config/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT 'sol-' || s.id AS clave, s.tipo::text AS tipo, s.created_at AS fecha,
              CASE WHEN s.tipo = 'emergencia' THEN 'Emergencia en ' ELSE 'Pedido de mantención: ' END || coalesce(i.nombre, i.codigo, 'sin instalación') AS titulo,
              c.nombre AS detalle, '/admin/solicitudes?id=' || s.id AS enlace, s.tipo = 'emergencia' AS importante
       FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id LEFT JOIN instalaciones i ON i.id = s.instalacion_id
       WHERE s.created_at > now() - interval '30 days' AND s.tipo <> 'consulta'
     UNION ALL
       SELECT 'val-' || p.id, 'por_validar', p.created_at,
              'Pago por revisar: ' || c.nombre || ' · $' || replace(to_char(p.monto, 'FM999G999G999'), ',', '.'),
              coalesce(i.nombre, i.codigo), '/admin/pagos?vista=validar', true
       FROM pagos p JOIN suscripciones s ON s.id = p.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE p.estado = 'pendiente' AND p.created_at > now() - interval '30 days'
     UNION ALL
       SELECT 'pag-' || p.id, 'pago', p.fecha_pago,
              'Pago recibido: ' || c.nombre || ' · $' || replace(to_char(p.monto, 'FM999G999G999'), ',', '.'),
              coalesce(i.nombre, i.codigo) || ' · pagado en línea', '/admin/pagos', false
       FROM pagos p JOIN suscripciones s ON s.id = p.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE p.estado = 'pagado' AND p.cobro_id IS NOT NULL AND p.fecha_pago > now() - interval '30 days'
     UNION ALL
       SELECT 'cob-' || k.id, 'rechazo', k.updated_at,
              'No se pudo cobrar la tarjeta de ' || c.nombre,
              coalesce(i.nombre, i.codigo) || ' · intento ' || k.intento, '/admin/seguimiento', true
       FROM cobros k JOIN suscripciones s ON s.id = k.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE k.canal = 'tarjeta' AND k.estado = 'rechazado' AND k.updated_at > now() - interval '30 days'
     UNION ALL
       SELECT 'sus-' || s.id, 'plan', s.created_at,
              CASE WHEN pf.rol = 'cliente' THEN c.nombre || ' contrató el ' || t.nombre ELSE 'Plan inscrito manualmente: ' || c.nombre END,
              coalesce(i.nombre, i.codigo), '/admin/suscripciones/' || s.id, false
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       JOIN tipos_suscripcion t ON t.id = s.tipo_suscripcion_id LEFT JOIN perfiles pf ON pf.id = s.creada_por
       WHERE s.created_at > now() - interval '30 days'
     UNION ALL
       SELECT 'baj-' || s.id, 'baja', s.updated_at,
              'Plan cerrado: ' || c.nombre,
              coalesce(i.nombre, i.codigo) || coalesce(' · ' || s.motivo_cierre, ''), '/admin/suscripciones/' || s.id, false
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE s.estado = 'cerrada' AND s.fecha_cierre > fn_hoy() - 30
     UNION ALL
       SELECT 'inf-' || m.id, 'informe', m.updated_at,
              coalesce(t.nombre, 'El técnico') || ' envió el informe de ' || coalesce(i.nombre, i.codigo),
              c.nombre, '/admin/mantenciones/' || m.id, false
       FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id JOIN clientes c ON c.id = i.cliente_id LEFT JOIN tecnicos t ON t.id = m.tecnico_id
       WHERE m.estado = 'realizada' AND m.fecha_realizada > fn_hoy() - 30
     UNION ALL
       SELECT 'cal-' || m.id, 'calificacion', m.updated_at,
              c.nombre || ' calificó la visita con ' || m.calificacion_cliente || (CASE WHEN m.calificacion_cliente = 1 THEN ' estrella' ELSE ' estrellas' END),
              coalesce(i.nombre, i.codigo) || coalesce(' · "' || left(m.comentario_cliente, 60) || '"', ''), '/admin/mantenciones/' || m.id, m.calificacion_cliente <= 3
       FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE m.calificacion_cliente IS NOT NULL AND m.updated_at > now() - interval '30 days'
     UNION ALL
       SELECT 'act-' || c.id, 'cuenta', pf.created_at,
              c.nombre || ' activó su cuenta del portal', 'Ya puede contratar planes y pedir visitas', '/admin/clientes/' || c.id, false
       FROM clientes c JOIN perfiles pf ON pf.id = c.perfil_id
       WHERE pf.created_at > now() - interval '30 days'
     ) n
     WHERE fecha IS NOT NULL
     ORDER BY fecha DESC LIMIT 40`);
  res.json(rows);
});

export default router;
