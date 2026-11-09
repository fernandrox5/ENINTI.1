// Panel de administración: todas las rutas exigen sesión con rol admin (se montan en /api/admin)
import { Router } from 'express';
import general from './general.js';
import clientes from './clientes.js';
import instalaciones from './instalaciones.js';
import suscripciones from './suscripciones.js';
import pagos from './pagos.js';
import mantenciones from './mantenciones.js';
import solicitudes from './solicitudes.js';
import seguimiento from './seguimiento.js';
import inicio from './inicio.js';
import configuracion from './configuracion.js';

const router = Router();
router.use(general);
router.use('/clientes', clientes);
router.use('/instalaciones', instalaciones);
router.use('/suscripciones', suscripciones);
router.use('/pagos', pagos);
router.use('/mantenciones', mantenciones);
router.use('/solicitudes', solicitudes);
router.use('/seguimiento', seguimiento);
router.use('/inicio', inicio);
router.use('/configuracion', configuracion);

export default router;
