// T-20 · Mockups 008 y 043: plantilla del portal del cliente
// Escritorio: menú lateral · Celular: barra inferior con Inicio, Instalaciones, Pagos, Mantenciones y Más
import { NavLink, Outlet } from 'react-router-dom';
import { Home, LayoutGrid, CreditCard, Wrench, Inbox, Tag, User, LogOut, Menu } from 'lucide-react';
import { useSesion } from '../sesion';

const MENU = [
  { a: '/portal', texto: 'Inicio', icono: Home, fin: true, barra: true },
  { a: '/portal/instalaciones', texto: 'Instalaciones', icono: LayoutGrid, barra: true },
  { a: '/portal/pagos', texto: 'Pagos', icono: CreditCard, barra: true },
  { a: '/portal/mantenciones', texto: 'Mantenciones', icono: Wrench, barra: true },
  { a: '/portal/solicitudes', texto: 'Mis solicitudes', icono: Inbox },
  { a: '/portal/planes', texto: 'Planes', icono: Tag },
  { a: '/portal/perfil', texto: 'Mi perfil', icono: User },
];

export default function PortalCliente() {
  const { salir } = useSesion();
  return (
    <div className="portal">
      <aside className="portal-menu solo-escritorio">
        <div className="portal-marca"><img src="/syntia-icono.png" alt="" className="marca-sol grande" /> <strong>Syntia</strong></div>
        <nav>
          {MENU.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink key={a} to={a} end={fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <span className="menu-icono"><Icono size={19} strokeWidth={1.9} /></span><span>{texto}</span>
            </NavLink>
          ))}
          <button type="button" className="portal-salir" onClick={salir}><LogOut size={20} /> Cerrar sesión</button>
        </nav>
      </aside>

      <main className="portal-pagina">
        <Outlet />
      </main>

      <nav className="portal-barra solo-celular" aria-label="Menú principal">
        {MENU.filter((m) => m.barra).map(({ a, texto, icono: Icono, fin }) => (
          <NavLink key={a} to={a} end={fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <span className="icono"><Icono size={22} strokeWidth={1.8} /></span>{texto}
          </NavLink>
        ))}
        <NavLink to="/portal/mas" className={({ isActive }) => (isActive ? 'activo' : '')}>
          <span className="icono"><Menu size={22} strokeWidth={1.8} /></span>Más
        </NavLink>
      </nav>
    </div>
  );
}
