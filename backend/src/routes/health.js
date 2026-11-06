import { Router } from 'express';
import { pool } from '../config/db.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Verifica que la API responde, la conexión con la base y con la API de Supabase
router.get('/', async (req, res) => {
  let db = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'sin conexión';
  }
  const { error } = await supabase.from('localidades').select('id', { head: true, count: 'exact' });
  res.json({ api: 'ok', db, supabase: error ? 'sin conexión' : 'ok' });
});

export default router;
