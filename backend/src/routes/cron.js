// Tareas programadas. Vercel Cron llama a /api/cron/avisos una vez al día enviando
// "Authorization: Bearer <CRON_SECRET>"; sin ese secreto la ruta no responde.
import { Router } from 'express';
import { procesoDiario } from '../services/avisos.js';
import { avisosDelDia } from '../services/notificar.js';
import { ejecutarCobros, revisarPendientes } from '../services/cobros.js';

const router = Router();

router.use((req, res, next) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

// Una vez al día: actualiza estados (vencidas) y manda los avisos del día
router.get('/avisos', async (req, res) => {
  const proceso = await procesoDiario();
  const avisos = await avisosDelDia();
  res.json({ proceso, avisos });
});

// Cobros automáticos del día (tarjetas inscritas y enlaces de pago). Se activan con COBROS_AUTOMATICOS=true
router.get('/cobros', async (req, res) => {
  if (process.env.COBROS_AUTOMATICOS !== 'true') return res.json({ desactivado: true });
  const revision = await revisarPendientes();
  const cobros = await ejecutarCobros();
  res.json({ revision, cobros });
});

export default router;
