// Acceso al portal por invitación: ENINTI crea la ficha del cliente y le envía un enlace para
// activar su cuenta y crear su contraseña (reemplaza al registro abierto).
import { pool } from '../config/db.js';
import { supabase } from '../config/supabase.js';
import { enviarCorreo } from './correo.js';
import { ErrorHttp } from '../utils/validar.js';

// Dominios desde los que se puede armar un enlace de correo: local, producción y las URL de desarrollo
// del proyecto en Vercel. Así nadie puede pedir una invitación con un Origin falso para que el enlace
// (con el token) apunte a otro sitio.
const PRODUCCION = 'https://syntia-iota.vercel.app';
const PERMITIDOS = [/^http:\/\/localhost:\d+$/, /^https:\/\/syntia-iota\.vercel\.app$/, /^https:\/\/syntia-[a-z0-9-]+-fernandos-projects-7f551f0e\.vercel\.app$/];

// URL pública del frontend para los enlaces de los correos: el origen del navegador que hizo la
// solicitud (en local, la página de Vite y no la API), si está permitido; si no, producción.
export function urlApp(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const candidatos = [req.get('origin'), `${proto}://${req.get('x-forwarded-host') || req.get('host')}`];
  return candidatos.find((o) => o && PERMITIDOS.some((r) => r.test(o))) ?? PRODUCCION;
}

// Primer nombre para el saludo, sin prefijos como "[PRUEBA]"
export const primerNombre = (nombre) => String(nombre || '').replace(/\[[^\]]*\]\s*/g, '').trim().split(/\s+/)[0] || '';

// Estado del acceso de un correo en Supabase Auth: sin cuenta, invitado (sin activar) o activo
export async function estadoAcceso(correo) {
  const { rows: [u] } = await pool.query(
    'SELECT id, email_confirmed_at, invited_at, last_sign_in_at FROM auth.users WHERE lower(email) = lower($1)',
    [correo]
  );
  if (!u) return { estado: 'sin_cuenta' };
  return { estado: u.email_confirmed_at ? 'activo' : 'invitado', ...u };
}

// Envía (o reenvía) la invitación al cliente. Falla si no tiene correo o si ya activó su cuenta.
export async function invitarCliente(req, clienteId) {
  const { rows: [c] } = await pool.query('SELECT id, nombre, email, telefono, activo FROM clientes WHERE id = $1', [clienteId]);
  if (!c) throw new ErrorHttp(404, 'Cliente no encontrado');
  if (!c.activo) throw new ErrorHttp(409, 'El cliente está desactivado');
  if (!c.email) throw new ErrorHttp(400, 'Agrega el correo del cliente en su ficha para enviarle la invitación');

  const acceso = await estadoAcceso(c.email);
  if (acceso.estado === 'activo') throw new ErrorHttp(409, 'El cliente ya activó su cuenta. Si olvidó la contraseña, puede recuperarla desde el ingreso.');

  // Primera vez: se crea el usuario invitado. Si ya fue invitado, se genera un enlace nuevo para el mismo usuario.
  const { data, error } = acceso.estado === 'sin_cuenta'
    ? await supabase.auth.admin.generateLink({ type: 'invite', email: c.email, options: { data: { nombre: c.nombre, telefono: c.telefono } } })
    : await supabase.auth.admin.generateLink({ type: 'magiclink', email: c.email });
  if (error) throw error;
  const tipo = acceso.estado === 'sin_cuenta' ? 'invite' : 'email';

  // La ficha queda vinculada al perfil desde ya (el trigger crea el perfil al crear el usuario)
  await pool.query('UPDATE clientes SET perfil_id = $1 WHERE id = $2 AND perfil_id IS NULL', [data.user.id, c.id]);

  const url = `${urlApp(req)}/activar?token=${encodeURIComponent(data.properties.hashed_token)}&t=${tipo}`;
  await enviarCorreo({
    para: c.email,
    asunto: 'ENINTI te dio acceso a Syntia',
    titulo: `Hola, ${primerNombre(c.nombre)}. Ya puedes ver tu instalación`,
    parrafos: [
      'ENINTI creó tu cuenta en Syntia. Ahí verás tus instalaciones, su ficha técnica, tus pagos y tus mantenciones, y podrás pedir una visita o reportar una emergencia.',
      'Para entrar, abre el siguiente enlace y crea tu contraseña. El enlace sirve una sola vez; si vence, pide uno nuevo desde "¿Primera vez? Pide tu acceso" en la página de ingreso.',
    ],
    boton: { texto: 'Activar mi cuenta', url },
  });
  return { correo: c.email };
}
