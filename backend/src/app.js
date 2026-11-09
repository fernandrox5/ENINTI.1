import express from 'express';
import cors from 'cors';
import health from './routes/health.js';
import auth from './routes/auth.js';
import cron from './routes/cron.js';
import flow from './routes/flow.js';
import admin from './routes/admin/index.js';
import portal from './routes/portal/index.js';
import tecnico from './routes/tecnico/index.js';
import { autenticar, permitir } from './middleware/auth.js';
import { ErrorHttp } from './utils/validar.js';
import { pool } from './config/db.js';

const app = express();

// En producción el frontend vive en otro dominio: CORS_ORIGINS lista los permitidos (separados por coma)
const origenes = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
if (origenes.length) app.use(cors({ origin: origenes }));

app.use(express.json());

app.use('/api/health', health);
// Datos de contacto de ENINTI para el portal y la página de ingreso (públicos)
app.get('/api/contacto', async (req, res) => {
  const { rows } = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN ('whatsapp', 'telefono_contacto')");
  const c = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  res.json({ whatsapp: c.whatsapp || null, telefono: c.telefono_contacto || null });
});
app.use('/api/auth', auth);
app.use('/api/cron', cron);
app.use('/api/flow', flow);
app.use('/api/admin', autenticar, permitir('admin'), admin);
app.use('/api/portal', autenticar, permitir('cliente'), portal);
app.use('/api/tecnico', autenticar, permitir('tecnico'), tecnico);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Errores: los ErrorHttp y las reglas de negocio de la base (RAISE EXCEPTION) se informan
// al usuario; el resto se registra
app.use((err, req, res, next) => {
  if (err instanceof ErrorHttp) return res.status(err.status).json({ error: err.message });
  if (err.code === 'P0001') return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados' });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});

export default app;
