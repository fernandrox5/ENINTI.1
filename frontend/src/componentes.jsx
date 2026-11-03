import { NavLink } from 'react-router-dom';
import { useSesion } from './Sesion.jsx';

export function Encabezado({ enlaces = [] }) {
  const { usuario, salir } = useSesion();
  return (
    <header className="encabezado">
      <div className="marca">ENINTI</div>
      <nav>
        {enlaces.map(([ruta, texto]) => (
          <NavLink key={ruta} to={ruta}>{texto}</NavLink>
        ))}
      </nav>
      <div className="usuario">
        <span>{usuario?.nombre}</span>
        <button className="secundario" onClick={salir}>Salir</button>
      </div>
    </header>
  );
}

export function Campo({ etiqueta, children, ayuda }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

export const Aviso = ({ tipo = 'error', children }) =>
  children ? <p className={`aviso ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{children}</p> : null;

export const Estado = ({ deuda }) =>
  deuda > 0 ? <span className="etiqueta mala">Con deuda</span> : <span className="etiqueta buena">Al día</span>;
