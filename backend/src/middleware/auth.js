import { verifyCredentials } from '@supabase/server/core';
import { pool } from '../config/db.js';

const EMISOR = `${process.env.SUPABASE_URL}/auth/v1`;

// Exige un token de Supabase Auth válido (se verifica con las claves públicas JWKS)
// y deja el perfil del usuario en req.usuario
export async function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  const { data, error } = await verifyCredentials({ token, apikey: null }, { auth: 'user', issuer: EMISOR });
  if (error) return res.status(401).json({ error: 'La sesión expiró, vuelve a ingresar' });

  const { rows: [perfil] } = await pool.query(
    'SELECT id, nombre, email, rol, activo FROM perfiles WHERE id = $1',
    [data.userClaims.id]
  );
  if (!perfil) return res.status(401).json({ error: 'Tu usuario no tiene un perfil en la plataforma' });
  if (!perfil.activo) return res.status(403).json({ error: 'Tu cuenta está desactivada' });
  req.usuario = perfil;
  next();
}

// Restringe la ruta a uno o más roles (admin, cliente, tecnico)
export function permitir(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}
