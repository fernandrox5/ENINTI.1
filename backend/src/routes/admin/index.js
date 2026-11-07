// Panel de administración: todas las rutas exigen sesión con rol admin (se montan en /api/admin)
import { Router } from 'express';
import general from './general.js';

const router = Router();
router.use(general);

export default router;
