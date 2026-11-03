import express from 'express';
import health from './routes/health.js';

const app = express();

app.use(express.json());

app.use('/api/health', health);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

export default app;
