// RF-09: rutas públicas que usa el navegador al volver de la pasarela
import { Router } from 'express';
import { pool } from '../config/db.js';
import { pasarela } from '../services/pasarela.js';

const router = Router();
const FRONT = process.env.FRONT_URL || 'http://localhost:5173';

// Retorno desde la pasarela (Transbank envía TBK_TOKEN por POST; si se anula, TBK_TOKEN viene vacío)
async function retorno(req, res) {
  const token = req.body?.TBK_TOKEN || req.query.TBK_TOKEN;
  const volver = (resultado) => res.redirect(303, `${FRONT}/cuenta/medio-pago?resultado=${resultado}`);
  if (!token) return volver('anulada');

  const { rows: [pendiente] } = await pool.query(
    'SELECT id, cliente_id FROM medio_pago WHERE token_pasarela = $1 AND activo = FALSE',
    [token]
  );
  if (!pendiente) return volver('error');

  try {
    const datos = await pasarela.finalizar(token);
    if (!datos) {
      await pool.query('DELETE FROM medio_pago WHERE id = $1', [pendiente.id]);
      return volver('rechazada');
    }
    // Un solo medio activo por cliente: el nuevo reemplaza al anterior
    await pool.query('UPDATE medio_pago SET activo = FALSE WHERE cliente_id = $1 AND activo', [pendiente.cliente_id]);
    await pool.query(
      `UPDATE medio_pago SET token_pasarela = $1, tipo_tarjeta = $2, ultimos_digitos = $3, activo = TRUE, creado_en = NOW()
       WHERE id = $4`,
      [datos.tokenPasarela, datos.tipoTarjeta, datos.ultimosDigitos, pendiente.id]
    );
    volver('ok');
  } catch (err) {
    console.error('Error al finalizar la inscripción:', err.message);
    await pool.query('DELETE FROM medio_pago WHERE id = $1', [pendiente.id]);
    volver('error');
  }
}
router.post('/retorno', retorno);
router.get('/retorno', retorno);

// Página de la pasarela simulada (imita el formulario de Webpay, sin pedir datos reales)
router.post('/simulada', (req, res) => {
  const token = req.body?.TBK_TOKEN;
  if (pasarela.modo !== 'simulada' || !pasarela.simulada.existe(token)) {
    return res.status(404).send('Inscripción no encontrada');
  }
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Pasarela de pago (prueba)</title>
<style>
  body{font:18px system-ui,sans-serif;background:#eef0f3;margin:0;display:grid;place-items:center;min-height:100vh;padding:1rem;box-sizing:border-box}
  form{background:#fff;border-radius:12px;padding:1.5rem;max-width:420px;width:100%;display:grid;gap:1rem;box-shadow:0 2px 12px #0002}
  h1{font-size:1.3rem;margin:0}.aviso{background:#fff6d6;padding:.6rem .8rem;border-radius:8px;font-size:.9rem;margin:0}
  label{display:flex;gap:.6rem;align-items:center;border:2px solid #d0d4cc;border-radius:8px;padding:.7rem}
  button{font:inherit;border:0;border-radius:8px;padding:.7rem;cursor:pointer;min-height:44px}
  .si{background:#0b5d3b;color:#fff}.no{background:#fff;border:2px solid #b3261e;color:#b3261e}
</style></head><body>
<form method="post" action="/api/pasarela/simulada/responder">
  <h1>Pasarela de pago · ambiente de pruebas</h1>
  <p class="aviso">Simulación del formulario de la pasarela. No ingreses datos reales: solo elige una tarjeta de prueba.</p>
  <input type="hidden" name="token" value="${token}">
  <label><input type="radio" name="tarjeta" value="Visa|6623" checked> Visa de prueba terminada en 6623</label>
  <label><input type="radio" name="tarjeta" value="Mastercard|2032"> Mastercard de prueba terminada en 2032</label>
  <button class="si" name="accion" value="aprobar">Autorizar inscripción</button>
  <button class="no" name="accion" value="rechazar">Rechazar</button>
</form></body></html>`);
});

router.post('/simulada/responder', (req, res) => {
  const { token, accion, tarjeta = 'Visa|6623' } = req.body || {};
  const [tipo, ultimos] = String(tarjeta).split('|');
  const urlRetorno = pasarela.simulada.responder(token, { aprobada: accion === 'aprobar', tipo, ultimos });
  if (!urlRetorno) return res.status(404).send('Inscripción no encontrada');
  // Igual que Webpay: el navegador vuelve al comercio enviando TBK_TOKEN por POST
  res.send(`<!doctype html><html><body onload="document.forms[0].submit()">
<form method="post" action="${urlRetorno}"><input type="hidden" name="TBK_TOKEN" value="${token}"></form>
</body></html>`);
});

export default router;
