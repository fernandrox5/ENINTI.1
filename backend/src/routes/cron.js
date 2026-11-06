// Tareas programadas. Vercel Cron llama a /api/cron/avisos una vez al día enviando
// "Authorization: Bearer <CRON_SECRET>"; sin ese secreto la ruta no responde.
import { Router } from 'express';
import { enviarAvisos, procesoDiario } from '../services/avisos.js';

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

export default router;
