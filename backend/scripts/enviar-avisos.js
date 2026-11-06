// Envía los avisos pendientes desde la terminal: npm run avisos --prefix backend
//   --generar   ejecuta antes fn_proceso_diario() para crear los avisos de hoy
// Con MAIL_REDIRECT en .env todos los correos llegan a esa dirección.
import { pool } from '../src/config/db.js';
import { enviarAvisos, procesoDiario } from '../src/services/avisos.js';

try {
  if (process.argv.includes('--generar')) {
    console.log('Proceso diario:', await procesoDiario());
  }
  const r = await enviarAvisos();
  console.log(`✔ ${r.enviados} enviados · ${r.fallidos} con error · ${r.revisados} revisados`);
  for (const e of r.errores ?? []) console.log(`  ✘ aviso ${e.id}: ${e.error}`);
  if (r.fallidos) process.exitCode = 1;
} catch (err) {
  console.error('✘ No se pudieron enviar los avisos:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
