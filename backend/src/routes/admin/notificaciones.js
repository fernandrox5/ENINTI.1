// Notificaciones de la campana del administrador: lo que pasó en los últimos 30 días
// (emergencias y pedidos, pagos por revisar, pagos en línea, cobros rechazados, planes contratados
// y cerrados, informes de visitas, calificaciones y cuentas activadas). Cada una lleva a su pantalla.
// Lo leído queda guardado por usuario en notificaciones_leidas (se marca una vez y sirve en todas partes).
import { Router } from 'express';
import { pool } from '../../config/db.js';

const router = Router();

// Claves que este usuario ya leyó (sin el script 10, la tabla no existe: nada queda leído en la base)
async function leidas(perfilId) {
  try {
    const { rows } = await pool.query('SELECT clave FROM notificaciones_leidas WHERE perfil_id = $1', [perfilId]);
    return new Set(rows.map((r) => r.clave));
  } catch { return null; }
}

router.get('/', async (req, res) => {
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
              coalesce(i.nombre, i.codigo) || ' · intento ' || k.intento, '/admin/clientes/' || c.id, true
       FROM cobros k JOIN suscripciones s ON s.id = k.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE k.canal = 'tarjeta' AND k.estado = 'rechazado' AND k.updated_at > now() - interval '30 days'
     UNION ALL
       SELECT 'sus-' || s.id, 'plan', s.created_at,
              CASE WHEN pf.rol = 'cliente' THEN c.nombre || ' contrató el ' || t.nombre ELSE 'Suscripción inscrita manualmente: ' || c.nombre END,
              coalesce(i.nombre, i.codigo), '/admin/suscripciones/' || s.id, false
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       JOIN tipos_suscripcion t ON t.id = s.tipo_suscripcion_id LEFT JOIN perfiles pf ON pf.id = s.creada_por
       WHERE s.created_at > now() - interval '30 days'
     UNION ALL
       SELECT 'baj-' || s.id, 'baja', s.updated_at,
              'Suscripción cerrada: ' || c.nombre,
              coalesce(i.nombre, i.codigo) || coalesce(' · ' || s.motivo_cierre, ''), '/admin/suscripciones/' || s.id, false
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE s.estado = 'cerrada' AND s.fecha_cierre > fn_hoy() - 30
     UNION ALL
       SELECT 'ven-' || s.id, 'vence', (s.fecha_termino - 15)::timestamptz,
              'La suscripción de ' || c.nombre || ' vence el ' || to_char(s.fecha_termino, 'DD-MM'),
              coalesce(i.nombre, i.codigo) || ' · conviene llamarlo para renovar', '/admin/clientes/' || c.id, false
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE s.estado = 'vigente' AND s.fecha_termino BETWEEN fn_hoy() AND fn_hoy() + 15
         AND NOT EXISTS (SELECT 1 FROM suscripciones n WHERE n.suscripcion_anterior_id = s.id)
     UNION ALL
       SELECT 'noren-' || s.id, 'no_renovo', s.fecha_termino::timestamptz,
              c.nombre || ' no renovó su suscripción',
              coalesce(i.nombre, i.codigo) || ' · venció el ' || to_char(s.fecha_termino, 'DD-MM'), '/admin/clientes/' || c.id, true
       FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id JOIN clientes c ON c.id = i.cliente_id
       WHERE s.estado = 'vencida' AND s.fecha_termino > fn_hoy() - 30
         AND NOT EXISTS (SELECT 1 FROM suscripciones n WHERE n.instalacion_id = s.instalacion_id AND n.estado = 'vigente')
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
  const vistas = await leidas(req.usuario.id);
  res.json(rows.map((n) => ({ ...n, leida: vistas ? vistas.has(n.clave) : false })));
});

// Marcar como leídas (una o todas)
router.post('/leidas', async (req, res) => {
  const claves = (Array.isArray(req.body.claves) ? req.body.claves : []).map(String).filter((c) => /^[a-z]+-\d+$/.test(c)).slice(0, 200);
  if (!claves.length) return res.json({ ok: true, marcadas: 0 });
  try {
    await pool.query(
      `INSERT INTO notificaciones_leidas (perfil_id, clave) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [req.usuario.id, claves]);
    res.json({ ok: true, marcadas: claves.length });
  } catch (err) {
    if (err.code === '42P01') return res.json({ ok: false, marcadas: 0 }); // falta el script 10: queda solo en el navegador
    throw err;
  }
});

export default router;
