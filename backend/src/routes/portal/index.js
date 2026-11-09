// Portal del cliente: todas las rutas exigen sesión con rol cliente (se montan en /api/portal)
import { Router } from 'express';
import general from './general.js';
import pagos from './pagos.js';
import mantenciones from './mantenciones.js';
import solicitudes from './solicitudes.js';

const router = Router();
router.use(general);
router.use('/pagos', pagos);
router.use('/mantenciones', mantenciones);
router.use('/solicitudes', solicitudes);

export default router;
