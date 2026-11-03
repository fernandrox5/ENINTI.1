import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

// Verifica que la API responde y si hay conexión con la base de datos
router.get('/', async (req, res) => {
  let db = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'sin conexión';
  }
  res.json({ api: 'ok', db });
});

export default router;
