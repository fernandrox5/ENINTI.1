// RF-01: ingreso con Supabase Auth (administrador, cliente y técnico).
// El backend inicia la sesión con la clave publicable y responde los tokens de Supabase
// junto con el perfil (nombre y rol) que guarda la tabla perfiles.
import { Router } from 'express';
import { pool } from '../config/db.js';
import { supabase, clienteAuth } from '../config/supabase.js';
import { autenticar } from '../middleware/auth.js';
import { ErrorHttp } from '../utils/validar.js';

const router = Router();

// Respuesta común de ingreso y renovación: tokens de Supabase y datos del perfil
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

router.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) throw new ErrorHttp(400, 'Ingresa tu correo y contraseña');
  const { data, error } = await clienteAuth().auth.signInWithPassword({ email: String(correo).trim(), password });
  if (error) {
    if (error.code === 'email_not_confirmed') throw new ErrorHttp(403, 'Debes activar tu cuenta desde el correo que te enviamos');
    throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
  }
  res.json(await sesion(data.session));
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
