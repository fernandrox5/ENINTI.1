// T-30 · RF-11: seguimiento para retener y recuperar clientes (mockups 092 a 096).
//   Pagos pendientes: el mes en curso no se ha pagado y corre el plazo de 7 días (antes "Morosos":
//                     ya no se acumula deuda; al vencer el plazo la suscripción se cierra sola)
//   Por vencer:       suscripciones vigentes que terminan en 30 días o menos
//   A recuperar:      instalaciones sin suscripción vigente (terminada o nunca suscrita)
//   Gestiones:        historial de llamadas, WhatsApp, correos y visitas
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { cobrosDelDia } from '../../services/cobros.js';

const router = Router();

// Última gestión de cada cliente (tipo y fecha)
export async function ultimasGestiones(ids) {
  if (!ids.length) return {};
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (cliente_id) cliente_id, tipo, fecha, motivo FROM gestiones
     WHERE cliente_id = ANY($1::bigint[]) ORDER BY cliente_id, fecha DESC`, [ids]);
  return Object.fromEntries(rows.map((g) => [g.cliente_id, g]));
}

export async function pagosPendientes() {
  // Con tarjeta, el día del cobro todavía no está pendiente: se cobra sola
  const lista = (await cobrosDelDia()).filter((r) => !(r.tarjeta_id && r.dias_pendiente === 0));
  const { rows: ultimos } = await pool.query(
    `SELECT DISTINCT ON (suscripcion_id) suscripcion_id, error, created_at FROM cobros
     WHERE suscripcion_id = ANY($1::bigint[]) AND estado = 'rechazado' ORDER BY suscripcion_id, created_at DESC`, [lista.map((r) => r.id)]);
  const rechazo = Object.fromEntries(ultimos.map((u) => [u.suscripcion_id, u]));
  return lista.map((r) => ({
    suscripcion_id: r.id, suscripcion: r.codigo, monto: r.monto_pactado, cliente_id: r.cliente_id, cliente: r.cliente, telefono: r.telefono,
    instalacion_id: r.instalacion_id, instalacion: r.instalacion, periodo: r.periodo, desde: r.inicio, dias: r.dias_pendiente, quedan_dias: r.quedan_dias,
    plazo: r.plazo, tarjeta: r.ultimos4 ? `${r.tarjeta_tipo ?? 'Tarjeta'} ···· ${r.ultimos4}` : null, intentos: r.intentos,
    ultimo_rechazo: rechazo[r.id]?.error ?? null, enlace_pendiente: Boolean(r.pendiente?.url_pago),
  }));
}

export async function porVencer() {
  const { rows } = await pool.query(
    `SELECT v.suscripcion_id, v.codigo AS suscripcion, v.tipo_nombre AS plan, v.fecha_termino, v.dias_restantes, v.cliente_id, v.cliente_nombre AS cliente,
            v.cliente_telefono AS telefono, v.instalacion_id, coalesce(v.instalacion_nombre, v.instalacion_codigo) AS instalacion,
            EXISTS (SELECT 1 FROM suscripciones n WHERE n.suscripcion_anterior_id = v.suscripcion_id) AS renovada,
            EXISTS (SELECT 1 FROM tarjetas t WHERE t.cliente_id = v.cliente_id AND t.estado = 'activa') AS con_tarjeta
     FROM v_por_vencer v ORDER BY v.dias_restantes`);
  return rows;
}

export async function aRecuperar() {
  const { rows } = await pool.query(
    `SELECT instalacion_id, instalacion_codigo, coalesce(instalacion_nombre, instalacion_codigo) AS instalacion, localidad, cliente_id,
            cliente_nombre AS cliente, cliente_telefono AS telefono, situacion, cantidad_suscripciones, ultima_fecha_fin, ultimo_motivo_cierre,
            coalesce(dias_sin_cobertura, fn_hoy() - coalesce(fecha_instalacion, fn_hoy())) AS dias_sin_cobertura
     FROM v_instalaciones_sin_suscripcion ORDER BY situacion DESC, dias_sin_cobertura NULLS LAST`);
  return rows;
}

router.get('/', async (req, res) => {
  const [pendientes, vencer, recuperar] = await Promise.all([pagosPendientes(), porVencer(), aRecuperar()]);
  const gestiones = await ultimasGestiones([...new Set([...pendientes, ...vencer, ...recuperar].map((r) => r.cliente_id))]);
  const conGestion = (lista) => lista.map((r) => ({ ...r, ultima_gestion: gestiones[r.cliente_id] ?? null }));
  const { rows: [g] } = await pool.query("SELECT count(*)::int AS n FROM gestiones WHERE fecha >= date_trunc('month', now())");
  res.json({ pagos_pendientes: conGestion(pendientes), por_vencer: conGestion(vencer), a_recuperar: conGestion(recuperar), gestiones_mes: g.n });
});

// Historial de gestiones (095): ?tipo= ?q= ?pagina=
router.get('/gestiones', async (req, res) => {
  const params = [];
  const filtros = [];
  if (['llamada', 'whatsapp', 'email', 'visita', 'otro'].includes(req.query.tipo)) { params.push(req.query.tipo); filtros.push(`g.tipo = $${params.length}`); }
  const q = String(req.query.q || '').trim();
  if (q) { params.push(`%${q}%`); filtros.push(`(c.nombre ILIKE $${params.length} OR g.motivo ILIKE $${params.length} OR g.resultado ILIKE $${params.length})`); }
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows: [t] } = await pool.query(`SELECT count(*)::int AS total FROM gestiones g JOIN clientes c ON c.id = g.cliente_id ${donde}`, params);
  const { rows } = await pool.query(
    `SELECT g.id, g.tipo, g.motivo, g.resultado, g.fecha, c.id AS cliente_id, c.nombre AS cliente, s.id AS suscripcion_id, s.codigo AS suscripcion, p.nombre AS realizada_por
     FROM gestiones g JOIN clientes c ON c.id = g.cliente_id LEFT JOIN suscripciones s ON s.id = g.suscripcion_id LEFT JOIN perfiles p ON p.id = g.realizada_por
     ${donde} ORDER BY g.fecha DESC LIMIT 25 OFFSET ${(pagina - 1) * 25}`, params);
  res.json({ gestiones: rows, total: t.total, pagina, por_pagina: 25 });
});

export default router;
