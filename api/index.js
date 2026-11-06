// Función de Vercel: toda la ruta /api/* la atiende la app Express del backend.
// Las variables de entorno se configuran en el panel de Vercel (Production y Preview).
import app from '../backend/src/app.js';

export default app;
