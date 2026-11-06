// Envío de avisos por correo (RF-25). pg_cron ejecuta fn_proceso_diario(), que deja los
// avisos en la tabla notificaciones; aquí se envían los pendientes por SMTP (Gmail) y se
// marca el resultado con fn_marcar_notificacion(). Los que fallan se reintentan hasta 3 veces.
import nodemailer from 'nodemailer';
import { pool } from '../config/db.js';

const MAX_INTENTOS = 3;

// Misma configuración SMTP que el proyecto SAC (SMTP_* y MAIL_*)
let transporte;
function smtp() {
  const { SMTP_HOST = 'smtp.gmail.com', SMTP_PORT = '465', SMTP_SECURE = 'true', SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('Faltan SMTP_USER y SMTP_PASSWORD para enviar correos');
  }
  transporte ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transporte;
}

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function html(asunto, mensaje) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#ffcc00;padding:18px 24px;font-size:20px;font-weight:bold">ENINTI</td></tr>
  <tr><td style="padding:24px">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapar(asunto)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.6">${escapar(mensaje)}</p>
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e5e5ea;color:#6e6e73;font-size:13px">
    Aviso automático de ENINTI · Energía solar para el norte de Chile. No respondas este correo.
  </td></tr>
</table></td></tr></table></body></html>`;
}

// Envía hasta `limite` avisos pendientes (o con error y menos de 3 intentos).
// MAIL_REDIRECT manda todos los correos a esa dirección (los datos de prueba son ficticios).
export async function enviarAvisos({ limite = 50 } = {}) {
  // MAIL_ENABLED=false desactiva el envío: los avisos quedan pendientes para después
  if (process.env.MAIL_ENABLED === 'false') return { revisados: 0, enviados: 0, fallidos: 0, desactivado: true };
  const correo = smtp(); // sin credenciales falla aquí, sin gastar intentos de los avisos
  const { rows } = await pool.query(
    `SELECT id, destinatario, asunto, mensaje
     FROM notificaciones
     WHERE estado IN ('pendiente', 'error') AND intentos < $1
     ORDER BY created_at, id
     LIMIT $2`,
    [MAX_INTENTOS, limite]
  );
  if (!rows.length) return { revisados: 0, enviados: 0, fallidos: 0 };

  const redirigir = process.env.MAIL_REDIRECT?.trim();
  const remitente = `"ENINTI" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`;
  const responderA = process.env.MAIL_REPLY_TO?.trim() || undefined;
  let enviados = 0;
  const fallidos = [];

  for (const n of rows) {
    try {
      await correo.sendMail({
        from: remitente,
        replyTo: responderA,
        to: redirigir || n.destinatario,
        subject: redirigir ? `${n.asunto} (para ${n.destinatario})` : n.asunto,
        text: n.mensaje,
        html: html(n.asunto, n.mensaje),
      });
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
