// Tareas programadas. Vercel Cron llama a /api/cron/avisos una vez al día enviando
// "Authorization: Bearer <CRON_SECRET>"; sin ese secreto la ruta no responde.
import { Router } from 'express';
import { enviarAvisos, procesoDiario } from '../services/avisos.js';
import { ejecutarCobros, revisarPendientes } from '../services/cobros.js';

const router = Router();

router.use((req, res, next) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

// ?generar=1 ejecuta antes fn_proceso_diario() (en producción ya lo hace pg_cron a las 08:00)
router.get('/avisos', async (req, res) => {
  const proceso = req.query.generar === '1' ? await procesoDiario() : null;
  const envio = await enviarAvisos();
  res.json({ proceso, envio });
});

// Cobros automáticos del día (tarjetas inscritas y enlaces de pago). Se activan con COBROS_AUTOMATICOS=true
router.get('/cobros', async (req, res) => {
  if (process.env.COBROS_AUTOMATICOS !== 'true') return res.json({ desactivado: true });
  const revision = await revisarPendientes();
  const cobros = await ejecutarCobros();
  res.json({ revision, cobros });
});

export default router;
