import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'eninti-desarrollo';

// Exige un token válido y deja los datos del usuario en req.usuario
export function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'La sesión expiró, vuelve a ingresar' });
  }
}

// Restringe la ruta a uno o más roles
export function permitir(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}
