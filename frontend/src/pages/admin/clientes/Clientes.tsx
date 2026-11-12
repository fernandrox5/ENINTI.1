// T-22 · Mockup 047: listado de clientes con búsqueda, localidad y estado
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Pestanas, Titulo, Vacio, type Tono } from '../../../componentes';
import { fechaCorta } from '../../../formato';
import ClienteFormulario from './ClienteFormulario';

export interface Localidad { id: number; nombre: string; comuna: string }
interface FilaCliente {
  id: number; nombre: string; rut: string | null; activo: boolean; localidad: string | null; portal: Portal;
  instalaciones: number; deuda: number; max_adeudados: number; con_deuda: number; por_validar: number;
  vigentes: number; dias_min: number | null; gestion_tipo: string | null; gestion_fecha: string | null;
}
interface Listado { clientes: FilaCliente[]; total: number; pagina: number; por_pagina: number; conteo: Record<Filtro, number> }
type Filtro = 'activos' | 'deuda' | 'inactivos' | 'todos';

export type Portal = 'activo' | 'invitado' | 'sin_acceso';
export const PORTAL: Record<Portal, [Tono, string]> = { activo: ['buena', 'Activa'], invitado: ['alerta', 'Invitado'], sin_acceso: ['neutra', 'Sin cuenta'] };

export const GESTIONES: Record<string, string> = { llamada: 'Llamada', whatsapp: 'WhatsApp', email: 'Correo', visita: 'Visita', otro: 'Otro' };

// Estado resumido de las suscripciones, como en la columna del mockup
export function estadoSuscripciones(c: Pick<FilaCliente, 'activo' | 'con_deuda' | 'max_adeudados' | 'por_validar' | 'vigentes' | 'dias_min'>): [Tono, string] {
  if (!c.activo) return ['neutra', 'Cliente inactivo'];
  if (c.con_deuda > 1) return ['mala', `${c.con_deuda} con pago pendiente`];
  if (c.con_deuda === 1) return ['mala', 'Pago pendiente'];
  if (c.por_validar > 0) return ['alerta', 'Pago en revisión'];
  if (c.vigentes > 0 && c.dias_min !== null && c.dias_min <= 30) return ['alerta', c.dias_min <= 0 ? 'Vence hoy' : `Vence en ${c.dias_min} días`];
  if (c.vigentes > 0) return ['buena', 'Al día'];
  return ['neutra', 'Sin suscripción'];
}

export default function Clientes() {
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('activos');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [pagina, setPagina] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const { datos: localidades } = useDatos<Localidad[]>('/admin/clientes/localidades');

  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ filtro, pagina: String(pagina) });
  if (busqueda) params.set('q', busqueda);
  if (localidad) params.set('localidad', localidad);
  const { datos, error, cargando } = useDatos<Listado>(`/admin/clientes?${params}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  return (
    <>
      <div className="encabezado">
        <Titulo icono={Users} fuerte="Clientes." suave={datos ? `${datos.conteo.todos} en total.` : undefined} />
        <button type="button" className="boton primario chico" onClick={() => setNuevo(true)}><Plus size={18} /> Nuevo cliente</button>
      </div>

      <div className="filtros">
        <label className="buscador-icono">
          <Search size={18} />
          <input className="buscador" type="search" placeholder="Nombre, RUT o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select value={localidad} onChange={(e) => { setLocalidad(e.target.value); setPagina(1); }} aria-label="Localidad">
          <option value="">Todas las localidades</option>
          {localidades?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </div>
      <Pestanas<Filtro>
        valor={filtro} cambiar={(f) => { setFiltro(f); setPagina(1); }}
        opciones={[['activos', 'Activos', datos?.conteo.activos], ['deuda', 'Pago pendiente', datos?.conteo.deuda],
          ['inactivos', 'Inactivos', datos?.conteo.inactivos], ['todos', 'Todos', datos?.conteo.todos]]}
      />

      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.clientes.length === 0 ? (
        <Vacio>No hay clientes que coincidan.</Vacio>
      ) : (
        <div className="tabla">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Localidad</th><th className="num">Instalaciones</th><th>Suscripción</th><th>Cuenta</th><th>Último contacto</th><th /></tr>
            </thead>
            <tbody>
              {datos.clientes.map((c) => {
                const [tono, texto] = estadoSuscripciones(c);
                return (
                  <tr key={c.id} className="clic" onClick={() => navegar(`/admin/clientes/${c.id}`)}>
                    <td><strong>{c.nombre}</strong><small>{c.rut || 'Sin RUT'}</small></td>
                    <td>{c.localidad || '—'}</td>
                    <td className="num">{c.instalaciones}</td>
                    <td><Etiqueta tono={tono} punto={tono !== 'neutra'}>{texto}</Etiqueta></td>
                    <td><Etiqueta tono={PORTAL[c.portal][0]}>{PORTAL[c.portal][1]}</Etiqueta></td>
                    <td>{c.gestion_tipo ? `${GESTIONES[c.gestion_tipo]} · ${fechaCorta(c.gestion_fecha)}` : '—'}</td>
                    <td><Link to={`/admin/clientes/${c.id}`} className="boton secundario mini" onClick={(e) => e.stopPropagation()}>Ver</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {datos && datos.total > datos.por_pagina && (
        <div className="paginacion">
          <span className="suave">Mostrando {datos.clientes.length} de {datos.total}</span>
          <div className="acciones">
            <button type="button" className="boton secundario mini" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <button type="button" className="boton secundario mini" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
          </div>
        </div>
      )}

      {nuevo && <ClienteFormulario cerrar={() => setNuevo(false)} listo={(id) => navegar(`/admin/clientes/${id}`)} />}
    </>
  );
}
