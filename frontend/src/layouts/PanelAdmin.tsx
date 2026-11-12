// T-20 · Mockup 046: plantilla del panel de administración (menú lateral, buscador y barra superior)
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, LayoutGrid, RefreshCw, CreditCard, CalendarDays, Inbox, BarChart3, Settings,
  Search, Menu, LogOut, X, ChevronDown,
} from 'lucide-react';
import { api } from '../api';
import { useSesion } from '../sesion';
import { useDatos } from '../useDatos';
import { iniciales } from '../formato';
import Notificaciones from './Notificaciones';

interface Contadores { pagos_por_validar: number; solicitudes_nuevas: number; emergencias: number }

const MENU = [
  { a: '/admin', texto: 'Inicio', icono: Home, fin: true },
  { a: '/admin/clientes', texto: 'Clientes', icono: Users },
  { a: '/admin/instalaciones', texto: 'Instalaciones', icono: LayoutGrid },
  { a: '/admin/suscripciones', texto: 'Suscripciones', icono: RefreshCw },
  { a: '/admin/pagos', texto: 'Pagos', icono: CreditCard, contador: 'pagos_por_validar' as const },
  { a: '/admin/mantenciones', texto: 'Mantenciones', icono: CalendarDays },
  { a: '/admin/solicitudes', texto: 'Solicitudes', icono: Inbox, contador: 'solicitudes_nuevas' as const, urgente: true },
  { a: '/admin/reportes', texto: 'Reportes', icono: BarChart3 },
  { a: '/admin/configuracion', texto: 'Configuración', icono: Settings },
];

export default function PanelAdmin() {
  const { usuario, salir } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();
  const { datos: contadores, recargar } = useDatos<Contadores>('/admin/contadores');

  // Al cambiar de página se cierra el menú del celular y se actualizan los contadores
  useEffect(() => { setMenuAbierto(false); recargar(); }, [ubicacion.pathname, recargar]);

  return (
    <div className={`panel ${menuAbierto ? 'menu-abierto' : ''}`}>
      <aside className="panel-menu">
        <div className="panel-marca">
          <img src="/syntia-icono.png" alt="" className="marca-sol grande" />
          <span><strong>Syntia</strong><small>Administración</small></span>
          <button type="button" className="icono-boton solo-celular" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú"><X size={22} /></button>
        </div>
        <nav>
          {MENU.map(({ a, texto, icono: Icono, fin, contador, urgente }) => {
            const n = contador ? contadores?.[contador] ?? 0 : 0;
            return (
              <NavLink key={a} to={a} end={fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
                <span className="menu-icono"><Icono size={19} strokeWidth={1.9} /></span>
                <span>{texto}</span>
                {n > 0 && <span className={`insignia ${urgente ? 'roja' : ''}`}>{n}</span>}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="panel-fondo" onClick={() => setMenuAbierto(false)} />

      <div className="panel-contenido">
        <header className="panel-barra">
          <button type="button" className="icono-boton solo-celular" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"><Menu size={24} /></button>
          <Buscador />
          <Notificaciones />
          <MenuUsuario nombre={usuario?.nombre} salir={salir} />
        </header>
        <main className="panel-pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

interface Resultados {
  clientes: { id: number; nombre: string; rut: string | null; localidad: string | null }[];
  instalaciones: { id: number; codigo: string; nombre: string | null; direccion: string; cliente: string }[];
  suscripciones: { id: number; codigo: string; estado: string; instalacion: string | null; cliente: string }[];
}

// Buscador global: cliente, RUT, código de instalación
function Buscador() {
  const [q, setQ] = useState('');
  const [r, setR] = useState<Resultados | null>(null);
  const [abierto, setAbierto] = useState(false);
  const navegar = useNavigate();
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setR(null); return; }
    const t = setTimeout(() => api<Resultados>(`/admin/buscar?q=${encodeURIComponent(q.trim())}`).then(setR).catch(() => setR(null)), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const ir = (ruta: string) => { setAbierto(false); setQ(''); navegar(ruta); };
  const total = r ? r.clientes.length + r.instalaciones.length + r.suscripciones.length : 0;

  return (
    <div className="buscador-global" ref={caja}>
      <Search size={19} className="lupa" />
      <input type="search" placeholder={window.innerWidth < 700 ? 'Buscar' : 'Buscar cliente, RUT o instalación'} value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} aria-label="Buscar" />
      {abierto && r && (
        <div className="buscador-resultados">
          {total === 0 && <p className="vacio-chico">Sin resultados para "{q}"</p>}
          {r.clientes.length > 0 && <h4>Clientes</h4>}
          {r.clientes.map((c) => (
            <button key={`c${c.id}`} type="button" onClick={() => ir(`/admin/clientes/${c.id}`)}>
              <strong>{c.nombre}</strong><small>{[c.rut, c.localidad].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          {r.instalaciones.length > 0 && <h4>Instalaciones</h4>}
          {r.instalaciones.map((i) => (
            <button key={`i${i.id}`} type="button" onClick={() => ir(`/admin/instalaciones/${i.id}`)}>
              <strong>{i.codigo} · {i.nombre || i.direccion}</strong><small>{i.cliente}</small>
            </button>
          ))}
          {r.suscripciones.length > 0 && <h4>Suscripciones</h4>}
          {r.suscripciones.map((s) => (
            <button key={`s${s.id}`} type="button" onClick={() => ir(`/admin/suscripciones/${s.id}`)}>
              <strong>{s.codigo}</strong><small>{s.cliente} · {s.instalacion} · {s.estado}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Usuario en la barra superior: al tocarlo se despliega "Cerrar sesión"
function MenuUsuario({ nombre, salir }: { nombre?: string; salir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, []);
  return (
    <div className="menu-usuario" ref={caja}>
      <button type="button" className="panel-usuario" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-haspopup="menu">
        <span className="avatar">{iniciales(nombre)}</span>
        <span className="solo-escritorio"><strong>{nombre}</strong><small>Administración</small></span>
        <ChevronDown size={18} className={`flecha ${abierto ? 'arriba' : ''}`} />
      </button>
      {abierto && (
        <div className="menu-usuario-panel" role="menu">
          <button type="button" role="menuitem" className="menu-usuario-salir" onClick={salir}><LogOut size={18} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
