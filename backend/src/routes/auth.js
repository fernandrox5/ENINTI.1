// RF-01 · RF-02: ingreso, registro, activación por correo y recuperación de contraseña con Supabase Auth.
// Los enlaces de los correos los genera Supabase (generateLink) y los envía el backend con la marca ENINTI;
// la página de destino entrega el token al backend, que lo verifica (verifyOtp) y abre la sesión.
import { Router } from 'express';
import { pool } from '../config/db.js';
import { supabase, clienteAuth } from '../config/supabase.js';
import { autenticar } from '../middleware/auth.js';
import { enviarCorreo } from '../services/correo.js';
import { correoValido, ErrorHttp } from '../utils/validar.js';

const router = Router();

// URL pública del frontend para armar los enlaces (en Vercel, el dominio por el que entró el usuario)
function urlApp(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

// Respuesta común de ingreso, activación y renovación: tokens de Supabase y datos del perfil
async function sesion(session) {
  const { rows: [perfil] } = await pool.query(
    'SELECT id, nombre, rol, activo FROM perfiles WHERE id = $1',
    [session.user.id]
  );
  if (!perfil) throw new ErrorHttp(403, 'Tu usuario no tiene un perfil en la plataforma');
  if (!perfil.activo) throw new ErrorHttp(403, 'Tu cuenta está desactivada');
  return {
    token: session.access_token,
    refresh_token: session.refresh_token,
    usuario: { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol },
  };
}

const normalizarCorreo = (c) => String(c || '').trim().toLowerCase();

async function correoActivacion(req, correo, nombre, hashed) {
  await enviarCorreo({
    para: correo,
    asunto: 'Activa tu cuenta de Syntia',
    titulo: `Hola${nombre ? `, ${nombre.split(' ')[0]}` : ''}. Activa tu cuenta`,
    parrafos: [
      'Recibimos tu registro en Syntia, la plataforma de ENINTI para ver tus instalaciones, pagos y mantenciones.',
      'Para activar tu cuenta abre el siguiente enlace. Al abrirlo entrarás directo a Syntia. El enlace vence en 1 hora.',
      'Si no creaste esta cuenta, ignora este correo.',
    ],
    boton: { texto: 'Activar mi cuenta', url: `${urlApp(req)}/activar?token=${encodeURIComponent(hashed)}` },
  });
}

router.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) throw new ErrorHttp(400, 'Ingresa tu correo y contraseña');
  const { data, error } = await clienteAuth().auth.signInWithPassword({ email: normalizarCorreo(correo), password });
  if (error) {
    if (error.code === 'email_not_confirmed') throw new ErrorHttp(403, 'Debes activar tu cuenta desde el correo que te enviamos');
    throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
  }
  res.json(await sesion(data.session));
});

// Mockup 006: crear cuenta. Queda pendiente de activación hasta que abra el enlace del correo (007).
router.post('/registro', async (req, res) => {
  const { nombre, telefono, password, acepta_condiciones } = req.body;
  const correo = normalizarCorreo(req.body.correo);
  if (!nombre?.trim()) throw new ErrorHttp(400, 'Ingresa tu nombre completo');
  if (!correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  if (!password || password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  if (acepta_condiciones !== true) throw new ErrorHttp(400, 'Debes aceptar los términos de uso y la política de privacidad');

  const { rows: [condiciones] } = await pool.query(
    'SELECT version FROM condiciones_servicio WHERE vigente_hasta IS NULL ORDER BY vigente_desde DESC LIMIT 1'
  );
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'signup',
    email: correo,
    password,
    options: {
      data: {
        nombre: nombre.trim(),
        telefono: telefono?.trim() || null,
        condiciones_version: condiciones?.version ?? null,
        condiciones_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    if (error.code === 'weak_password') throw new ErrorHttp(400, 'La contraseña es muy débil, prueba con otra');
    if (error.code !== 'email_exists' && error.status !== 422) throw error;
    // Ya existe: si no la ha activado, se le reenvía el enlace; si ya está activa, debe ingresar
    const { rows: [u] } = await pool.query('SELECT email_confirmed_at FROM auth.users WHERE lower(email) = $1', [correo]);
    if (u?.email_confirmed_at) throw new ErrorHttp(409, 'Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.');
    const reenvio = await supabase.auth.admin.generateLink({ type: 'magiclink', email: correo });
    if (reenvio.error) throw reenvio.error;
    await correoActivacion(req, correo, nombre, reenvio.data.properties.hashed_token);
    return res.status(201).json({ correo });
  }

  await correoActivacion(req, correo, nombre, data.properties.hashed_token);
  res.status(201).json({ correo });
});

// Mockup 007 "Reenviar correo": nuevo enlace de activación si la cuenta sigue sin activar
router.post('/reenviar-activacion', async (req, res) => {
  const correo = normalizarCorreo(req.body.correo);
  if (!correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  const { rows: [u] } = await pool.query(
    `SELECT u.email_confirmed_at, p.nombre FROM auth.users u LEFT JOIN perfiles p ON p.id = u.id WHERE lower(u.email) = $1`,
    [correo]
  );
  if (u && !u.email_confirmed_at) {
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: correo });
    if (error) throw error;
    await correoActivacion(req, correo, u.nombre, data.properties.hashed_token);
  }
  res.json({ ok: true }); // misma respuesta exista o no la cuenta
});

// Enlace del correo de activación: confirma el correo, vincula la ficha de cliente y abre la sesión
router.post('/activar', async (req, res) => {
  const { token } = req.body;
  if (!token) throw new ErrorHttp(400, 'El enlace no es válido');
  const { data, error } = await clienteAuth().auth.verifyOtp({ token_hash: token, type: 'email' });
  if (error || !data.session) throw new ErrorHttp(400, 'El enlace venció o ya fue usado. Pide uno nuevo desde "Crear cuenta".');

  // El trigger de auth.users vincula la ficha que tenga ese correo; si no existe, se crea
  const user = data.session.user;
  await pool.query(
    `INSERT INTO clientes (perfil_id, nombre, email, telefono, origen)
     SELECT p.id, COALESCE(p.nombre, split_part(p.email, '@', 1)), lower(p.email), p.telefono, 'Registro web'
     FROM perfiles p
     WHERE p.id = $1 AND p.rol = 'cliente'
       AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.perfil_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM clientes c WHERE lower(c.email) = lower(p.email))`,
    [user.id]
  );
  await pool.query(
    `UPDATE clientes SET perfil_id = $1 WHERE perfil_id IS NULL AND lower(email) = lower($2)`,
    [user.id, user.email]
  );
  res.json(await sesion(data.session));
});

// Mockup 003: pedir el enlace para crear una nueva contraseña (004: revisa tu correo)
router.post('/recuperar', async (req, res) => {
  const correo = normalizarCorreo(req.body.correo);
  if (!correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: correo });
  if (!error) {
    const { rows: [p] } = await pool.query('SELECT nombre FROM perfiles WHERE id = $1', [data.user.id]);
    await enviarCorreo({
      para: correo,
      asunto: 'Crea una nueva contraseña para Syntia',
      titulo: `Hola${p?.nombre ? `, ${p.nombre.split(' ')[0]}` : ''}. Crea tu nueva contraseña`,
      parrafos: [
        'Pediste crear una nueva contraseña para ingresar a Syntia.',
        'Abre el siguiente enlace para elegirla. El enlace vence en 1 hora.',
        'Si no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.',
      ],
      boton: { texto: 'Crear nueva contraseña', url: `${urlApp(req)}/nueva-contrasena?token=${encodeURIComponent(data.properties.hashed_token)}` },
    });
  }
  res.json({ ok: true }); // misma respuesta exista o no la cuenta
});

// Mockup 005: guardar la nueva contraseña. Después vuelve a Ingresar.
router.post('/restablecer', async (req, res) => {
  const { token, password } = req.body;
  if (!token) throw new ErrorHttp(400, 'El enlace no es válido');
  if (!password || password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  const { data, error } = await clienteAuth().auth.verifyOtp({ token_hash: token, type: 'recovery' });
  if (error || !data.user) throw new ErrorHttp(400, 'El enlace venció o ya fue usado. Pide uno nuevo.');
  const upd = await supabase.auth.admin.updateUserById(data.user.id, { password });
  if (upd.error) {
    if (upd.error.code === 'weak_password') throw new ErrorHttp(400, 'La contraseña es muy débil, prueba con otra');
    if (upd.error.code === 'same_password') throw new ErrorHttp(400, 'La nueva contraseña debe ser distinta de la anterior');
    throw upd.error;
  }
  res.json({ ok: true });
});

// El token de Supabase dura una hora: el frontend lo renueva con el refresh token
router.post('/renovar', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) throw new ErrorHttp(401, 'La sesión expiró, vuelve a ingresar');
  const { data, error } = await clienteAuth().auth.refreshSession({ refresh_token });
  if (error || !data.session) throw new ErrorHttp(401, 'La sesión expiró, vuelve a ingresar');
  res.json(await sesion(data.session));
});

// Cierra la sesión en Supabase (invalida el refresh token)
router.post('/salir', autenticar, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  await supabase.auth.admin.signOut(token).catch(() => {});
  res.json({ ok: true });
});

router.get('/yo', autenticar, (req, res) => {
  const { id, nombre, rol } = req.usuario;
  res.json({ usuario: { id, nombre, rol } });
});

export default router;
