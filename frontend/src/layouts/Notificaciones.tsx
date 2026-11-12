// Campana de notificaciones del administrador: contador de no leídas y panel desplegable.
// Lo leído se guarda en este navegador (por usuario). Se actualiza cada minuto y al cambiar de página.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../api';
import { useSesion } from '../sesion';

interface Notificacion { clave: string; tipo: string; fecha: string; titulo: string; detalle: string | null; enlace: string; importante: boolean }

// Solo cuentan como nuevas las de los últimos 7 días que no se han abierto
const DIAS_NUEVA = 7;

export function haceCuanto(fecha: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function leer(clave: string): string[] {
  try { return JSON.parse(localStorage.getItem(clave) ?? '[]'); } catch { return []; }
}
function guardar(clave: string, leidas: string[]) {
  try { localStorage.setItem(clave, JSON.stringify(leidas.slice(-300))); } catch { /* sin almacenamiento: se pierden al recargar */ }
}

export default function Notificaciones() {
  const { usuario } = useSesion();
  const almacen = `syntia-notificaciones-${usuario?.id ?? 'admin'}`;
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [leidas, setLeidas] = useState<string[]>(() => leer(almacen));
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const cargar = useCallback(() => { api<Notificacion[]>('/admin/notificaciones').then(setLista).catch(() => {}); }, []);
  useEffect(() => { cargar(); }, [cargar, ubicacion.pathname]);
  useEffect(() => { const t = setInterval(cargar, 60000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, []);

  const limite = Date.now() - DIAS_NUEVA * 86400000;
  const esNueva = (n: Notificacion) => !leidas.includes(n.clave) && new Date(n.fecha).getTime() > limite;
  const nuevas = lista.filter(esNueva).length;
  const marcar = (claves: string[]) => { const todas = [...new Set([...leidas, ...claves])]; setLeidas(todas); guardar(almacen, todas); };
  const abrir = (n: Notificacion) => { marcar([n.clave]); setAbierto(false); navegar(n.enlace); };

  return (
    <div className="notificaciones" ref={caja}>
      <button type="button" className={`icono-boton campana ${abierto ? 'abierta' : ''}`} onClick={() => setAbierto(!abierto)}
        aria-label={nuevas ? `Notificaciones: ${nuevas} sin leer` : 'Notificaciones'} aria-expanded={abierto}>
        <Bell size={21} />
        {nuevas > 0 && <span className="campana-contador">{nuevas > 9 ? '9+' : nuevas}</span>}
      </button>
      {abierto && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <header>
            <h2>Notificaciones</h2>
            {nuevas > 0 && <button type="button" className="notif-marcar" onClick={() => marcar(lista.map((n) => n.clave))}>Marcar todas como leídas</button>}
          </header>
          {lista.length === 0 ? <p className="notif-vacio">No hay novedades en los últimos 30 días.</p> : (
            <ul>
              {lista.map((n) => {
                const nueva = esNueva(n);
                return (
                  <li key={n.clave}>
                    <button type="button" className={`notif ${nueva ? 'nueva' : ''}`} onClick={() => abrir(n)}>
                      <i className={`notif-punto ${n.importante ? 'importante' : ''}`} aria-hidden="true" />
                      <span className="notif-texto">
                        <strong>{n.titulo}</strong>
                        {n.detalle && <span>{n.detalle}</span>}
                        <small>{haceCuanto(n.fecha)}</small>
                      </span>
                      {nueva && <i className="notif-sin-leer" aria-label="Sin leer" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
