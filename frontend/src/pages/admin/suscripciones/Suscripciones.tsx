// T-21 · Mockup 072: listado de suscripciones por estado (vigentes, vencidas, cerradas) y situación de pago
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Titulo, Vacio, type Tono } from '../../../componentes';
import { fechaCorta, mes } from '../../../formato';

type Estado = 'vigente' | 'vencida' | 'cerrada';
type Pago = 'todas' | 'al_dia' | 'deuda';
export interface FilaSuscripcion {
  id: number; codigo: string; estado: Estado; tipo_nombre: string; fecha_inicio: string; fecha_termino: string; fecha_cierre: string | null;
  motivo_cierre: string | null; dias_restantes: number; pagado_hasta: string | null; periodos_adeudados: number; pagos_por_validar: number;
  cliente_id: number; cliente_nombre: string; instalacion_id: number; instalacion_codigo: string; instalacion_nombre: string | null; direccion: string;
  tiene_siguiente: boolean;
}
interface Listado { suscripciones: FilaSuscripcion[]; total: number; pagina: number; por_pagina: number; conteo: Record<Estado | 'al_dia' | 'deuda', number> }

const ESTADOS: [Estado, string][] = [['vigente', 'Vigentes'], ['vencida', 'Vencidas'], ['cerrada', 'Cerradas']];
const PAGOS: [Pago, string][] = [['todas', 'Todas'], ['al_dia', 'Al día'], ['deuda', 'Pago pendiente']];

// "Al día", "Pago pendiente", "Pago por validar"
export function situacionPago(s: { periodos_adeudados: number; pagos_por_validar: number }): [Tono, string] {
  if (s.periodos_adeudados > 0) return ['mala', 'Pago pendiente'];
  if (s.pagos_por_validar > 0) return ['alerta', 'Pago por validar'];
  return ['buena', 'Al día'];
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
  const [estado, setEstado] = useState<Estado>('vigente');
  const [pago, setPago] = useState<Pago>('todas');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ estado, pago, pagina: String(pagina) });
  if (busqueda) params.set('q', busqueda);
  const { datos, error, cargando } = useDatos<Listado>(`/admin/suscripciones?${params}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  const parar = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <div className="encabezado">
        <Titulo icono={RefreshCw} fuerte="Suscripciones." suave={datos ? `${datos.conteo.vigente} ${datos.conteo.vigente === 1 ? 'vigente' : 'vigentes'}.` : undefined} />
        <Link to="/admin/suscripciones/nueva" className="boton secundario chico" title="Lo normal es que el cliente contrate desde su portal">Inscribir manualmente</Link>
      </div>
      <div className="filtros">
        <div className="segmentos" role="tablist" aria-label="Estado">
          {ESTADOS.map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={estado === v} className={estado === v ? 'activo' : ''}
              onClick={() => { setEstado(v); setPagina(1); }}>
              {t}{datos ? ` · ${datos.conteo[v]}` : ''}
            </button>
          ))}
        </div>
        <div className="segmentos" role="tablist" aria-label="Pagos">
          {PAGOS.map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={pago === v} className={pago === v ? 'activo' : ''}
              onClick={() => { setPago(v); setPagina(1); }}>
              {t}{datos && v !== 'todas' ? ` · ${datos.conteo[v]}` : ''}
            </button>
          ))}
        </div>
        <label className="buscador-icono">
          <Search size={18} />
          <input className="buscador" type="search" placeholder="Código, cliente o instalación" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.suscripciones.length === 0 ? <Vacio>No hay suscripciones que coincidan.</Vacio> : (
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Cliente · instalación</th><th>Plan</th><th>Vigencia</th>
              <th>{estado === 'vigente' ? 'Quedan' : estado === 'cerrada' ? 'Cierre' : 'Venció'}</th><th>Pagado hasta</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {datos.suscripciones.map((s) => {
                const [tono, texto] = situacionPago(s);
                return (
                  <tr key={s.id} className="clic" onClick={() => navegar(`/admin/suscripciones/${s.id}`)}>
                    <td>{s.codigo}</td>
                    <td><strong>{s.cliente_nombre}</strong><small>{s.instalacion_nombre || s.direccion} · {s.instalacion_codigo}</small></td>
                    <td>{s.tipo_nombre.replace(/^Plan /, '')}</td>
                    <td className="sin-corte">Hasta {fechaCorta(s.fecha_termino)}<small>Desde {fechaCorta(s.fecha_inicio)}</small></td>
                    <td>{estado === 'vigente' ? <Quedan dias={s.dias_restantes} />
                      : estado === 'cerrada' ? <>{fechaCorta(s.fecha_cierre)}<small>{s.motivo_cierre}</small></> : fechaCorta(s.fecha_termino)}</td>
                    <td className="sin-corte">{s.pagado_hasta ? mes(s.pagado_hasta).replace(/^(\w{3})\w*/, '$1') : 'Sin pagos'}</td>
                    <td><Etiqueta tono={tono}>{texto}</Etiqueta></td>
                    <td><div className="acciones sin-corte">
                      {s.estado === 'vigente' && <Link to={`/admin/pagos/registrar?suscripcion=${s.id}`} className="boton secundario mini" onClick={parar}>+ Pago</Link>}
                    </div></td>
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
