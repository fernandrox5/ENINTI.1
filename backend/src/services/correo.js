// Envío de correos por SMTP (misma configuración que el proyecto SAC: SMTP_* y MAIL_*).
// Lo usan los avisos diarios y los correos de cuenta (activación y recuperación).
import nodemailer from 'nodemailer';

let transporte;
export function smtp() {
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

export const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plantilla con la marca ENINTI. `parrafos` son textos planos; `boton` es { texto, url }.
export function plantilla({ titulo, parrafos = [], boton, pie }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6">${escapar(p)}</p>`).join('');
  const accion = boton
    ? `<p style="margin:22px 0 8px"><a href="${escapar(boton.url)}" style="display:inline-block;background:#ffcc00;color:#1d1d1f;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:12px">${escapar(boton.texto)}</a></p>
       <p style="margin:0;font-size:12px;color:#6e6e73;word-break:break-all">Si el botón no funciona, copia este enlace: ${escapar(boton.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#ffcc00;padding:18px 24px;font-size:20px;font-weight:bold">ENINTI</td></tr>
  <tr><td style="padding:24px">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapar(titulo)}</h1>
    ${cuerpo}${accion}
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e5e5ea;color:#6e6e73;font-size:13px">
    ${escapar(pie ?? 'Aviso automático de ENINTI · Energía solar para el norte de Chile. No respondas este correo.')}
  </td></tr>
</table></td></tr></table></body></html>`;
}

// Envía un correo. Con `redirigible` (solo avisos con datos de prueba), MAIL_REDIRECT lo desvía;
// los correos de cuenta siempre llegan a su destinatario real.
export async function enviarCorreo({ para, asunto, titulo, parrafos, boton, pie, redirigible = false }) {
  const redirigir = redirigible ? process.env.MAIL_REDIRECT?.trim() : '';
  const texto = [...(parrafos ?? []), boton ? `${boton.texto}: ${boton.url}` : ''].filter(Boolean).join('\n\n');
  return smtp().sendMail({
    from: `"ENINTI" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
    replyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
    to: redirigir || para,
    subject: redirigir ? `${asunto} (para ${para})` : asunto,
    text: texto,
    html: plantilla({ titulo: titulo ?? asunto, parrafos, boton, pie }),
  });
}
