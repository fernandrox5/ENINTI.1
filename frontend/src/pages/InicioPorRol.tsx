// Después de ingresar, cada rol va a su área (o a la página que pidió antes de ingresar,
// por ejemplo la del botón de un correo, si es de su área)
import { Navigate, useLocation } from 'react-router-dom';
import { DESTINO, useSesion } from '../sesion';

export default function InicioPorRol() {
  const { usuario } = useSesion();
  const estado = useLocation().state;
  if (!usuario) return <Navigate to="/login" replace />;
  const area = usuario.rol === 'admin' ? '/admin' : usuario.rol === 'cliente' ? '/portal' : '/tecnico';
  let pedida: string | null = null;
  try { pedida = sessionStorage.getItem(DESTINO); } catch { /* sin almacenamiento */ }
  const destino = pedida && (pedida === area || pedida.startsWith(`${area}/`) || pedida.startsWith(`${area}?`)) ? pedida : area;
  return <Navigate to={destino} replace state={estado} />;
}
