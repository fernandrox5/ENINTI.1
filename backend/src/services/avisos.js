// Envío de avisos por correo (RF-25). pg_cron ejecuta fn_proceso_diario(), que deja los
// avisos en la tabla notificaciones; aquí se envían los pendientes por SMTP (Gmail) y se
// marca el resultado con fn_marcar_notificacion(). Los que fallan se reintentan hasta 3 veces.
import { pool } from '../config/db.js';
import { smtp, enviarCorreo } from './correo.js';

const MAX_INTENTOS = 3;

// Envía hasta `limite` avisos pendientes (o con error y menos de 3 intentos).
// MAIL_REDIRECT manda todos los avisos a esa dirección (los datos de prueba son ficticios).
export async function enviarAvisos({ limite = 50 } = {}) {
  // MAIL_ENABLED=false desactiva el envío: los avisos quedan pendientes para después
  if (process.env.MAIL_ENABLED === 'false') return { revisados: 0, enviados: 0, fallidos: 0, desactivado: true };
  smtp(); // sin credenciales falla aquí, sin gastar intentos de los avisos
  const { rows } = await pool.query(
    `SELECT id, destinatario, asunto, mensaje
     FROM notificaciones
     WHERE estado IN ('pendiente', 'error') AND intentos < $1
     ORDER BY created_at, id
     LIMIT $2`,
    [MAX_INTENTOS, limite]
  );
  if (!rows.length) return { revisados: 0, enviados: 0, fallidos: 0 };

  let enviados = 0;
  const fallidos = [];
  for (const n of rows) {
    try {
      await enviarCorreo({ para: n.destinatario, asunto: n.asunto, parrafos: [n.mensaje], redirigible: true });
      await pool.query('SELECT fn_marcar_notificacion($1, true)', [n.id]);
      enviados++;
    } catch (err) {
      await pool.query('SELECT fn_marcar_notificacion($1, false, $2)', [n.id, String(err.message).slice(0, 500)]);
      fallidos.push({ id: n.id, error: err.message });
    }
  }
  return { revisados: rows.length, enviados, fallidos: fallidos.length, errores: fallidos };
}

// Genera los avisos del día igual que pg_cron (útil para probar sin esperar a las 08:00)
export async function procesoDiario() {
  const { rows: [r] } = await pool.query('SELECT fn_proceso_diario() AS resultado');
  return r.resultado;
}
