// Rutas que llama Flow (públicas, sin sesión). No se confía en lo que llega: con el token se
// consulta el estado real a Flow antes de registrar nada.
//   POST /api/flow/confirmacion   aviso de Flow de que un pago cambió de estado
//   POST /api/flow/retorno        el navegador del cliente vuelve después de pagar
//   POST /api/flow/tarjeta        el navegador vuelve después de inscribir la tarjeta
import express, { Router } from 'express';
import { pool } from '../config/db.js';
import * as flow from '../services/flow.js';
import { aplicarResultado } from '../services/cobros.js';
import { PRODUCCION, urlPermitida } from '../services/invitaciones.js';

const router = Router();
router.use(express.urlencoded({ extended: false }));

const token = (req) => String(req.body?.token || req.query.token || '').trim();
// Vuelve al portal en el mismo sitio desde el que se pagó (solo dominios permitidos)
const volver = (req, res, ruta) => res.redirect(303, `${urlPermitida(req.query.app) ? req.query.app : PRODUCCION}${ruta}`);

async function procesarPago(t) {
  const r = await flow.estadoPago(t);
  const { rows: [c] } = await pool.query('SELECT id FROM cobros WHERE flow_token = $1 OR commerce_order = $2', [t, r.commerceOrder ?? '']);
  if (!c) return { estado: null };
  return { estado: await aplicarResultado(c.id, r) };
}

router.post('/confirmacion', async (req, res) => {
  const t = token(req);
  if (!t) return res.status(400).send('Falta el token');
  try {
    await procesarPago(t);
    res.send('ok');
  } catch (err) {
    console.error('Flow confirmación:', err.message);
    res.status(500).send('error');
  }
});

router.all('/retorno', async (req, res) => {
  const t = token(req);
  let estado = null;
  if (t) estado = (await procesarPago(t).catch(() => ({ estado: null }))).estado;
  volver(req, res, `/portal/pagos?resultado=${estado ?? 'pendiente'}`);
});

router.all('/tarjeta', async (req, res) => {
  const t = token(req);
  let resultado = 'error';
  if (t) {
    try {
      const r = await flow.estadoInscripcion(t);
      const { rows: [tarjeta] } = await pool.query("SELECT * FROM tarjetas WHERE token_registro = $1 AND estado = 'pendiente'", [t]);
      if (tarjeta && String(r.status) === '1') {
        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          await db.query("UPDATE tarjetas SET estado = 'eliminada', eliminada_at = now() WHERE cliente_id = $1 AND estado = 'activa'", [tarjeta.cliente_id]);
          await db.query("UPDATE tarjetas SET estado = 'activa', tipo = $2, ultimos4 = $3, inscrita_at = now() WHERE id = $1",
            [tarjeta.id, r.creditCardType || null, /^\d{4}$/.test(String(r.last4CardDigits)) ? String(r.last4CardDigits) : null]);
          await db.query('COMMIT');
        } catch (err) {
          await db.query('ROLLBACK');
          throw err;
        } finally {
          db.release();
        }
        resultado = 'inscrita';
      } else if (tarjeta) {
        await pool.query("UPDATE tarjetas SET estado = 'eliminada', eliminada_at = now() WHERE id = $1", [tarjeta.id]);
        resultado = 'rechazada';
      }
    } catch (err) {
      console.error('Flow tarjeta:', err.message);
    }
  }
  volver(req, res, `/portal/pagos?tarjeta=${resultado}`);
});

export default router;
