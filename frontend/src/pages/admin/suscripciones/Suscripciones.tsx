// T-21 · Mockup 072: listado de suscripciones por estado (vigentes, vencidas, cerradas) y situación de pago
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Titulo, Vacio, type Tono } from '../../../componentes';
import { fechaCorta } from '../../../formato';

type Estado = 'vigente' | 'vencida' | 'cerrada';
type Vista = 'todas' | 'vigentes' | 'pendientes' | 'terminadas';
export interface FilaSuscripcion {
  id: number; codigo: string; estado: Estado; tipo_nombre: string; fecha_inicio: string; fecha_termino: string; fecha_cierre: string | null;
  motivo_cierre: string | null; dias_restantes: number; pagado_hasta: string | null; periodos_adeudados: number; pagos_por_validar: number;
  cliente_id: number; cliente_nombre: string; instalacion_id: number; instalacion_codigo: string; instalacion_nombre: string | null; direccion: string;
  tiene_siguiente: boolean;
}
interface Listado { suscripciones: FilaSuscripcion[]; total: number; pagina: number; por_pagina: number; conteo: Record<Vista, number> }

const VISTAS: [Vista, string][] = [['todas', 'Todas'], ['vigentes', 'Vigentes'], ['pendientes', 'Con pago pendiente'], ['terminadas', 'Terminadas']];

// "Al día", "Pago pendiente", "Pago por validar"
export function situacionPago(s: { periodos_adeudados: number; pagos_por_validar: number }): [Tono, string] {
  if (s.periodos_adeudados > 0) return ['mala', 'Pago pendiente'];
  if (s.pagos_por_validar > 0) return ['alerta', 'Pago por validar'];
  return ['buena', 'Al día'];
}

// Cómo terminó una suscripción vencida o cerrada
function comoTermino(s: { estado: string; motivo_cierre: string | null }): [Tono, string] {
  if (s.estado === 'vencida') return ['neutra', 'Venció sin renovar'];
  if (s.motivo_cierre === 'Falta de pago') return ['mala', 'Cerrada por falta de pago'];
  if (s.motivo_cierre?.startsWith('Cancelada por el cliente')) return ['neutra', 'El cliente la canceló'];
  return ['neutra', s.motivo_cierre ? `Cerrada: ${s.motivo_cierre.toLowerCase()}` : 'Cerrada'];
}

// Días que quedan: rojo si quedan 7 o menos, amarillo hasta 30
export function Quedan({ dias }: { dias: number }) {
  const texto = dias < 0 ? `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}` : dias === 0 ? 'Vence hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (dias <= 7) return <Etiqueta tono="mala">{texto}</Etiqueta>;
  if (dias <= 30) return <Etiqueta tono="alerta">{texto}</Etiqueta>;
  return <>{texto}</>;
}

export default function Suscripciones() {
  const navegar = useNavigate();
  const [vista, setVista] = useState<Vista>('vigentes');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ vista, pagina: String(pagina) });
  if (busqueda) params.set('q', busqueda);
  const { datos, error, cargando } = useDatos<Listado>(`/admin/suscripciones?${params}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  return (
    <>
      <div className="encabezado">
        <Titulo icono={RefreshCw} fuerte="Suscripciones" suave={datos ? `${datos.conteo.vigentes} ${datos.conteo.vigentes === 1 ? 'vigente' : 'vigentes'}` : undefined} />
      </div>
      <div className="filtros">
        <div className="segmentos" role="tablist" aria-label="Suscripciones">
          {VISTAS.map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? 'activo' : ''}
              onClick={() => { setVista(v); setPagina(1); }}>
              {t}{datos ? ` · ${datos.conteo[v]}` : ''}
            </button>
          ))}
        </div>
        <label className="buscador-icono">
          <Search size={18} />
          <input className="buscador" type="search" placeholder="Buscar cliente o instalación" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.suscripciones.length === 0 ? <Vacio>No hay suscripciones que coincidan.</Vacio> : (
        <div className="tabla">
          <table>
            <thead><tr><th>Cliente · instalación</th><th>Plan</th>
              {vista === 'todas' ? <><th>Vigencia</th><th>Estado</th></> : vista === 'terminadas' ? <><th>Duró</th><th>Cómo terminó</th></> : <><th>Vence</th><th>Pagado hasta</th><th>Pago</th></>}</tr></thead>
            <tbody>
              {datos.suscripciones.map((s) => {
                const [tono, texto] = situacionPago(s);
                return (
                  <tr key={s.id} className="clic" onClick={() => navegar(`/admin/suscripciones/${s.id}`)}>
                    <td><strong>{s.cliente_nombre}</strong><small>{s.instalacion_nombre || s.direccion}</small></td>
                    <td>{s.tipo_nombre.replace(/^Plan /, '')}</td>
                    {vista === 'todas' ? (
                      <>
                        <td className="sin-corte">{fechaCorta(s.fecha_inicio)} → {fechaCorta(s.fecha_cierre ?? s.fecha_termino)}</td>
                        <td>{s.estado === 'vigente' ? <Etiqueta tono={tono} punto>{tono === 'buena' ? 'Vigente · al día' : `Vigente · ${texto.toLowerCase()}`}</Etiqueta>
                          : <Etiqueta tono={comoTermino(s)[0]}>{comoTermino(s)[1]}</Etiqueta>}</td>
                      </>
                    ) : vista === 'terminadas' ? (
                      <>
                        <td className="sin-corte">{fechaCorta(s.fecha_inicio)} → {fechaCorta(s.fecha_cierre ?? s.fecha_termino)}</td>
                        <td><Etiqueta tono={comoTermino(s)[0]}>{comoTermino(s)[1]}</Etiqueta></td>
                      </>
                    ) : (
                      <>
                        <td className="sin-corte">{fechaCorta(s.fecha_termino)}<small><Quedan dias={s.dias_restantes} /></small></td>
                        <td className="sin-corte">{s.pagado_hasta ? fechaCorta(s.pagado_hasta) : 'Sin pagos'}</td>
                        <td><Etiqueta tono={tono}>{texto}</Etiqueta></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {datos && datos.total > datos.por_pagina && (
        <div className="paginacion">
          <span className="suave">Mostrando {datos.suscripciones.length} de {datos.total}</span>
          <div className="acciones">
            <button type="button" className="boton secundario mini" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <button type="button" className="boton secundario mini" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
          </div>
        </div>
      )}
    </>
  );
}
