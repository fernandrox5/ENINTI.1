// Funciones del ingreso que se construyen en las próximas entregas
// (registro y recuperación de contraseña: T-20)
import { Link } from 'react-router-dom';
import { Marca } from '../componentes';

export default function Proximamente({ titulo }: { titulo: string }) {
  return (
    <div className="proximamente">
      <Marca />
      <h1 className="titulo-grande"><strong>{titulo}.</strong> <span>Disponible pronto.</span></h1>
      <p>Estamos preparando esta sección. Mientras tanto, si necesitas ayuda escríbenos a ENINTI.</p>
      <Link to="/login" className="boton secundario">Volver al ingreso</Link>
    </div>
  );
}
