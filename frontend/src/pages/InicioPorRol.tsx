// Después de ingresar, cada rol va a su área
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../sesion';

export default function InicioPorRol() {
  const { usuario } = useSesion();
  const estado = useLocation().state;
  if (!usuario) return <Navigate to="/login" replace />;
  const destino = usuario.rol === 'admin' ? '/admin' : usuario.rol === 'cliente' ? '/portal' : '/tecnico';
  return <Navigate to={destino} replace state={estado} />;
}
