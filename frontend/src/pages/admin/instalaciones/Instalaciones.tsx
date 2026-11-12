// T-24 · Mockup 055: listado de instalaciones con filtros por estado de la suscripción
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, Search } from 'lucide-react';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Titulo, Vacio } from '../../../componentes';
import { SISTEMAS, fechaCorta } from '../../../formato';
import { situacionInstalacion } from '../../../estados';

type Filtro = 'todas' | 'al_dia' | 'deuda' | 'por_vencer' | 'sin';
interface Fila {
  id: number; codigo: string; nombre: string | null; direccion: string; tipo_sistema: string | null; potencia_kwp: string | null;
  localidad: string | null; cliente_id: number; cliente: string; suscripcion_id: number | null; dias_restantes: number | null;
  periodos_adeudados: number | null; pagos_por_validar: number | null; proxima: { fecha: string; tecnico: string | null } | null;
}
interface Listado { instalaciones: Fila[]; total: number; pagina: number; por_pagina: number; conteo: Record<Filtro, number> }

const FILTROS: [Filtro, string][] = [['todas', 'Todas'], ['al_dia', 'Al día'], ['deuda', 'Pago pendiente'], ['por_vencer', 'Por vencer'], ['sin', 'Sin suscripción']];

export const sistema = (i: { tipo_sistema: string | null; potencia_kwp: string | null }) =>
  [i.tipo_sistema ? SISTEMAS[i.tipo_sistema] : null, i.potencia_kwp ? `${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : null].filter(Boolean).join(' · ') || '—';

export default function Instalaciones() {
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ filtro, pagina: String(pagina) });
  if (busqueda) params.set('q', busqueda);
  const { datos, error, cargando } = useDatos<Listado>(`/admin/instalaciones?${params}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  return (
    <>
      <div className="encabezado">
        <Titulo icono={LayoutGrid} fuerte="Instalaciones." suave={datos ? `${datos.conteo.todas} en total.` : undefined} />
        <Link to="/admin/instalaciones/nueva" className="boton primario chico"><Plus size={18} /> Nueva instalación</Link>
      </div>
      <div className="filtros">
        <label className="buscador-icono">
          <Search size={18} />
          <input className="buscador" type="search" placeholder="Buscar instalación o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="segmentos" role="tablist">
          {FILTROS.map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? 'activo' : ''}
              onClick={() => { setFiltro(v); setPagina(1); }}>
              {t}{datos && v !== 'todas' ? ` · ${datos.conteo[v]}` : ''}
            </button>
          ))}
        </div>
      </div>

      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.instalaciones.length === 0 ? <Vacio>No hay instalaciones que coincidan.</Vacio> : (
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Instalación</th><th>Cliente</th><th>Localidad</th><th>Sistema</th><th>Suscripción</th><th>Próxima mantención</th><th /></tr></thead>
            <tbody>
              {datos.instalaciones.map((i) => {
                const [tono, texto] = situacionInstalacion(i);
                return (
                  <tr key={i.id} className="clic" onClick={() => navegar(`/admin/instalaciones/${i.id}`)}>
                    <td>{i.codigo}</td>
                    <td><strong>{i.nombre || i.direccion}</strong>{i.nombre && <small>{i.direccion}</small>}</td>
                    <td><Link to={`/admin/clientes/${i.cliente_id}`} onClick={(e) => e.stopPropagation()}>{i.cliente}</Link></td>
                    <td>{i.localidad || '—'}</td>
                    <td>{sistema(i)}</td>
                    <td><Etiqueta tono={tono} punto={tono !== 'neutra'}>{texto}</Etiqueta></td>
                    <td>{i.proxima ? `${fechaCorta(i.proxima.fecha)} · ${i.proxima.tecnico ?? 'sin técnico'}` : i.suscripcion_id ? 'Por agendar' : '—'}</td>
                    <td>
                      <span className="boton secundario mini">Ver</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {datos && datos.total > datos.por_pagina && (
        <div className="paginacion">
          <span className="suave">Mostrando {datos.instalaciones.length} de {datos.total}</span>
          <div className="acciones">
            <button type="button" className="boton secundario mini" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <button type="button" className="boton secundario mini" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
          </div>
        </div>
      )}
    </>
  );
}
