// RF-01 · RF-02: ingreso, acceso por invitación y recuperación de contraseña con Supabase Auth.
// No hay registro abierto: ENINTI crea la ficha del cliente y le envía una invitación para activar su cuenta.
// Los enlaces los genera Supabase (generateLink) y los envía el backend con la marca ENINTI; la página de
// destino entrega el token al backend, que lo verifica (verifyOtp) y abre la sesión.
import { Router } from 'express';
import { pool } from '../config/db.js';
import { supabase, clienteAuth } from '../config/supabase.js';
import { autenticar } from '../middleware/auth.js';
import { enviarCorreo } from '../services/correo.js';
import { urlApp, invitarCliente, estadoAcceso, primerNombre } from '../services/invitaciones.js';
import { correoValido, ErrorHttp } from '../utils/validar.js';

const router = Router();

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

// "¿Primera vez? Pide tu acceso": si el correo está en la ficha de un cliente activo y aún no activa
// su cuenta, se le envía la invitación. La respuesta es la misma en todos los casos.
router.post('/pedir-acceso', async (req, res) => {
  const correo = normalizarCorreo(req.body.correo);
  if (!correoValido(correo)) throw new ErrorHttp(400, 'El correo no es válido');
  const { rows: [c] } = await pool.query('SELECT id FROM clientes WHERE lower(email) = $1 AND activo', [correo]);
  if (c && (await estadoAcceso(correo)).estado !== 'activo') {
    await invitarCliente(req, c.id).catch((err) => console.error('No se pudo enviar la invitación:', err.message));
  }
  res.json({ ok: true });
});

// Enlace de la invitación: verifica el token, guarda la contraseña que eligió y abre la sesión
router.post('/activar', async (req, res) => {
  const { token, t, password } = req.body;
  if (!token) throw new ErrorHttp(400, 'El enlace no es válido');
  if (!password || password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  const { data, error } = await clienteAuth().auth.verifyOtp({ token_hash: token, type: t === 'invite' ? 'invite' : 'email' });
  if (error || !data.session) throw new ErrorHttp(400, 'El enlace venció o ya fue usado. Pide uno nuevo desde "¿Primera vez? Pide tu acceso".');

  const user = data.session.user;
  const upd = await supabase.auth.admin.updateUserById(user.id, { password });
  if (upd.error) {
    if (upd.error.code === 'weak_password') throw new ErrorHttp(400, 'La contraseña es muy débil, prueba con otra');
    throw upd.error;
  }
  // Vincula la ficha con ese correo (si la invitación no la dejó vinculada)
  await pool.query('UPDATE clientes SET perfil_id = $1 WHERE perfil_id IS NULL AND lower(email) = lower($2)', [user.id, user.email]);
  const respuesta = await sesion(data.session);

  // Confirmación "Tu cuenta quedó activa" (si falla el envío, la activación igual queda hecha)
  await enviarCorreo({
    para: user.email,
    asunto: 'Tu cuenta de Syntia quedó activa',
    titulo: `Listo, ${primerNombre(respuesta.usuario.nombre)}. Tu cuenta quedó activa`,
    parrafos: [
      'Ya puedes entrar a Syntia con tu correo y la contraseña que creaste.',
      'Ahí verás tus instalaciones, su ficha técnica, tus pagos y tus mantenciones. También puedes pedir una visita o reportar una emergencia.',
      'Si no fuiste tú quien activó la cuenta, avísale a ENINTI de inmediato.',
    ],
    boton: { texto: 'Ir a Syntia', url: `${urlApp(req)}/login` },
  }).catch((err) => console.error('No se pudo enviar la confirmación de activación:', err.message));
  res.json(respuesta);
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
      titulo: `Hola${p?.nombre ? `, ${primerNombre(p.nombre)}` : ''}. Crea tu nueva contraseña`,
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
