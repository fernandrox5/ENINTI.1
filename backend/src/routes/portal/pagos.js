// Portal del cliente · Pagos (mockups 018 a 026 y 045): su situación de pago, su tarjeta inscrita
// para el cobro automático y el pago en línea con Flow (transferencia, Webpay y otros medios).
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { ErrorHttp } from '../../utils/validar.js';
import * as flow from '../../services/flow.js';
import { clienteFlow, crearEnlacePago, periodosSinPagar, plazoPago } from '../../services/cobros.js';
import { urlApp } from '../../services/invitaciones.js';

const router = Router();

async function miCliente(req) {
  const { rows: [c] } = await pool.query('SELECT id, nombre, email, flow_customer_id FROM clientes WHERE perfil_id = $1', [req.usuario.id]);
  if (!c) throw new ErrorHttp(404, 'Tu cuenta no está asociada a un cliente. Escríbenos para revisarlo.');
  return c;
}

router.get('/', async (req, res) => {
  const c = await miCliente(req);
  const [tarjeta, suscripciones, pagos] = await Promise.all([
    pool.query("SELECT tipo, ultimos4, inscrita_at FROM tarjetas WHERE cliente_id = $1 AND estado = 'activa'", [c.id]),
    pool.query(
      `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre, v.monto_pactado, v.frecuencia_pago, v.fecha_inicio, v.fecha_termino,
              v.pagado_hasta, v.periodos_adeudados, v.monto_adeudado, v.pagos_por_validar, v.instalacion_nombre, v.instalacion_codigo, v.direccion
       FROM v_suscripciones_estado v
       WHERE v.cliente_id = $1 AND v.estado = 'vigente'
       ORDER BY v.estado = 'vigente' DESC, v.fecha_termino DESC`, [c.id]),
    pool.query(
      `SELECT p.id, p.periodo, p.monto, p.fecha_pago, p.medio_pago, p.estado, p.nro_boleta, p.motivo_rechazo, s.codigo AS suscripcion,
              p.cobro_id IS NOT NULL AS en_linea
       FROM pagos p JOIN suscripciones s ON s.id = p.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id
       WHERE i.cliente_id = $1 ORDER BY coalesce(p.fecha_pago, p.created_at) DESC LIMIT 36`, [c.id]),
  ]);
  // Próximo cobro y, si hay un periodo vencido sin pagar, cuántos días de plazo le quedan
  const plazo = await plazoPago();
  const hoy = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
  const lista = [];
  for (const s of suscripciones.rows.filter((x) => x.estado === 'vigente')) {
    const sinPagar = await periodosSinPagar(s.id);
    const vencido = sinPagar.find((p) => p.vencido);
    lista.push({
      ...s,
      proximo_cobro: sinPagar.find((p) => !p.vencido)?.inicio ?? null,
      pendiente: vencido ? { desde: vencido.inicio, quedan_dias: Math.max(0, plazo - Math.round((hoy - Date.parse(vencido.inicio)) / 864e5)) } : null,
      puede_adelantar: sinPagar.length,
    });
  }
  res.json({ cliente: c.nombre, email: c.email, tarjeta: tarjeta.rows[0] ?? null, suscripciones: lista, pagos: pagos.rows });
});

// Inscribir (o cambiar) la tarjeta: devuelve la página de Flow donde el cliente la ingresa
router.post('/tarjeta', async (req, res) => {
  const c = await clienteFlow((await miCliente(req)).id);
  const base = urlApp(req);
  const r = await flow.inscribirTarjeta(c.flow_customer_id, `${base}/api/flow/tarjeta?app=${encodeURIComponent(base)}`);
  await pool.query("UPDATE tarjetas SET estado = 'eliminada', eliminada_at = now() WHERE cliente_id = $1 AND estado = 'pendiente'", [c.id]);
  await pool.query("INSERT INTO tarjetas (cliente_id, token_registro) VALUES ($1, $2)", [c.id, r.token]);
  res.json({ url: `${r.url}?token=${r.token}` });
});

// Quitar la tarjeta: se deja de cobrar automático (los pagos siguen con enlace)
router.delete('/tarjeta', async (req, res) => {
  const c = await miCliente(req);
  const { rows: [t] } = await pool.query("SELECT id FROM tarjetas WHERE cliente_id = $1 AND estado = 'activa'", [c.id]);
  if (!t) throw new ErrorHttp(404, 'No tienes una tarjeta inscrita');
  if (c.flow_customer_id) await flow.eliminarTarjeta(c.flow_customer_id);
  await pool.query("UPDATE tarjetas SET estado = 'eliminada', eliminada_at = now() WHERE id = $1", [t.id]);
  res.json({ ok: true });
});

// Pagar ahora el periodo pendiente (o adelantar el próximo): devuelve la página de pago de Flow
router.post('/pagar', async (req, res) => {
  const c = await miCliente(req);
  const { rows: [s] } = await pool.query(
    'SELECT s.id FROM suscripciones s JOIN instalaciones i ON i.id = s.instalacion_id WHERE s.id = $1 AND i.cliente_id = $2',
    [Number(req.body.suscripcion_id) || 0, c.id]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada');
  const cobro = await crearEnlacePago(req, s.id, { cantidad: 1, origen: 'cliente', perfilId: req.usuario.id });
  res.json({ url: cobro.url_pago, monto: cobro.monto });
});

// Cancelar la suscripción (como en Netflix): queda cubierta hasta el fin del periodo ya pagado y no
// se cobra más. Se cierra con el motivo que elija el cliente; nada se borra.
router.post('/cancelar', async (req, res) => {
  const c = await miCliente(req);
  const { rows: [s] } = await pool.query(
    `SELECT v.suscripcion_id AS id, v.codigo, v.pagado_hasta, v.fecha_inicio, v.fecha_termino FROM v_suscripciones_estado v
     WHERE v.suscripcion_id = $1 AND v.cliente_id = $2 AND v.estado = 'vigente'`, [Number(req.body.suscripcion_id) || 0, c.id]);
  if (!s) throw new ErrorHttp(404, 'Suscripción no encontrada o ya no está vigente');
  const motivo = String(req.body.motivo || '').trim().slice(0, 200) || 'Sin indicar';
  // Fin de la cobertura: el día siguiente al último día pagado (o hoy si no ha pagado nada)
  const { rows: [{ cierre }] } = await pool.query(
    'SELECT greatest(fn_hoy(), least(coalesce($1::date + 1, fn_hoy()), $2::date))::text AS cierre', [s.pagado_hasta, s.fecha_termino]);
  await pool.query("UPDATE cobros SET estado = 'anulado', error = 'El cliente canceló la suscripción' WHERE suscripcion_id = $1 AND estado = 'pendiente'", [s.id]);
  await pool.query('SELECT fn_cerrar_suscripcion($1, $2, $3::date)', [s.id, `Cancelada por el cliente: ${motivo}`, cierre]);
  res.json({ ok: true, cubierta_hasta: cierre });
});

export default router;
