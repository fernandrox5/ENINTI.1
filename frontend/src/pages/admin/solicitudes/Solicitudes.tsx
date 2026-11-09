// T-29 · Mockups 090 y 091: solicitudes de los clientes con las emergencias primero. A la izquierda
// la lista y a la derecha el detalle (?id=): tomar, responder (lo ve el cliente), agendar la
// mantención, resolver o cerrar. "Anotar solicitud" registra las que llegan por teléfono o WhatsApp.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Plus, Search, Wrench, Zap } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Cargando, Etiqueta, Modal, Selector, Titulo, Vacio, type Tono } from '../../../componentes';
import { fechaCorta, fechaHora } from '../../../formato';
import { CANALES, ESTADO_SOLICITUD, TIPO_SOLICITUD } from '../../../estados';

interface Solicitud {
  id: number; tipo: string; prioridad: string; descripcion: string; canal: string; estado: string; respuesta: string | null; atendida_at: string | null;
  created_at: string; updated_at: string; cliente_id: number; cliente: string; cliente_telefono: string | null; cliente_email: string | null;
  instalacion_id: number | null; instalacion_codigo: string | null; instalacion: string | null; tipo_sistema: string | null; potencia_kwp: string | null;
  atendida_por: string | null; suscripcion_id: number | null; suscripcion: string | null; periodos_adeudados: number | null;
  mantencion: { id: number; estado: string; fecha_programada: string | null; fecha_realizada: string | null } | null;
}
type Estado = 'nueva' | 'en_proceso' | 'resuelta' | 'cerrada';

export const PRIORIDAD: Record<string, [Tono, string]> = { critica: ['mala', 'Crítica'], alta: ['mala', 'Alta'], media: ['alerta', 'Media'], baja: ['neutra', 'Baja'] };
const ICONO = { emergencia: Zap, mantencion: Wrench, consulta: Info } as const;
const SOL = (id: number) => `SOL-${String(id).padStart(4, '0')}`;

// "hace 12 min", "hoy 10:20", "ayer", "3 nov"
function cuando(f: string) {
  const d = new Date(f);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return `hoy ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
  hoy.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'ayer';
  return fechaCorta(f);
}

export default function Solicitudes() {
  const [params, setParams] = useSearchParams();
  const [estado, setEstado] = useState<Estado>('nueva');
  const [tipo, setTipo] = useState('');
  const [version, setVersion] = useState(0);
  const [anotar, setAnotar] = useState(false);
  const [aviso, setAviso] = useState('');
  const { datos, error, cargando } = useDatos<{ solicitudes: Solicitud[]; conteo: Record<Estado | 'emergencias', number> }>(
    `/admin/solicitudes?estado=${estado}${tipo ? `&tipo=${tipo}` : ''}&v=${version}`);
  const idSel = Number(params.get('id')) || datos?.solicitudes[0]?.id || 0;
  const elegir = (id: number) => setParams({ id: String(id) }, { replace: true });
  const listo = (m: string) => { setAviso(m); setVersion((v) => v + 1); };

  return (
    <>
      <div className="encabezado">
        <Titulo fuerte="Solicitudes" />
        <button type="button" className="boton primario chico" onClick={() => setAnotar(true)}><Plus size={18} /> Anotar solicitud</button>
      </div>
      <div className="filtros">
        <div className="segmentos">
          {(['nueva', 'en_proceso', 'resuelta', 'cerrada'] as Estado[]).map((e) => (
            <button key={e} type="button" className={estado === e ? 'activo' : ''} onClick={() => { setEstado(e); setParams({}, { replace: true }); }}>
              {e === 'nueva' ? 'Nuevas' : e === 'en_proceso' ? 'En proceso' : e === 'resuelta' ? 'Resueltas' : 'Cerradas'}{datos && (e === 'nueva' || e === 'en_proceso') ? ` · ${datos.conteo[e]}` : ''}
            </button>
          ))}
        </div>
        <div className="segmentos empujar">
          {[['', 'Todos'], ['emergencia', 'Emergencia'], ['mantencion', 'Mantención'], ['consulta', 'Consulta']].map(([v, t]) => (
            <button key={v} type="button" className={tipo === v ? 'activo' : ''} onClick={() => setTipo(v)}>{t}</button>
          ))}
        </div>
      </div>
      <Aviso tipo="ok">{aviso}</Aviso>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.solicitudes.length === 0 ? <Vacio>No hay solicitudes {estado === 'nueva' ? 'nuevas' : estado === 'en_proceso' ? 'en proceso' : estado === 'resuelta' ? 'resueltas' : 'cerradas'}.</Vacio> : (
        <div className="maestro-detalle">
          <ul className="lista-solicitudes">
            {datos.solicitudes.map((s) => {
              const Icono = ICONO[s.tipo as keyof typeof ICONO] ?? Info;
              return (
                <li key={s.id}>
                  <button type="button" className={`${s.id === idSel ? 'elegida' : ''} ${s.tipo}`} onClick={() => elegir(s.id)}>
                    <span className={`icono-solicitud ${s.tipo}`}><Icono size={20} /></span>
                    <span className="lista-solicitudes-texto"><strong>{TIPO_SOLICITUD[s.tipo]} · {s.cliente}</strong>
                      <small>{s.instalacion ?? s.instalacion_codigo ?? 'Sin instalación'} · {CANALES[s.canal]} · {cuando(s.created_at)}</small></span>
                    <Etiqueta tono={PRIORIDAD[s.prioridad][0]}>{PRIORIDAD[s.prioridad][1]}</Etiqueta>
                  </button>
                </li>
              );
            })}
          </ul>
          {idSel ? <Detalle key={`${idSel}-${version}`} id={idSel} listo={listo} /> : null}
        </div>
      ))}
      {anotar && <Anotar cerrar={() => setAnotar(false)} listo={(id) => { setAnotar(false); setEstado('en_proceso'); elegir(id); listo('Solicitud anotada'); }} />}
    </>
  );
}

function Detalle({ id, listo }: { id: number; listo: (m: string) => void }) {
  const { datos: s, error } = useDatos<Solicitud>(`/admin/solicitudes/${id}`);
  const [respuesta, setRespuesta] = useState('');
  const [falla, setFalla] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (s) setRespuesta(s.respuesta ?? ''); }, [s]);
  if (!s) return <section className="tarjeta">{error ? <Aviso>{error}</Aviso> : <Cargando />}</section>;
  const abierta = s.estado === 'nueva' || s.estado === 'en_proceso';
  const accion = async (ruta: string, body: object | undefined, mensaje: string) => {
    setFalla('');
    setOcupado(true);
    try { await api(`/admin/solicitudes/${s.id}/${ruta}`, { method: 'POST', body }); listo(mensaje); }
    catch (e) { setFalla((e as Error).message); setOcupado(false); }
  };
  const tipoMantencion = s.tipo === 'emergencia' ? 'emergencia' : 'correctiva';

  return (
    <section className="tarjeta detalle-solicitud">
      <header className="tarjeta-cabecera">
        <span className="suave">{SOL(s.id)} · {TIPO_SOLICITUD[s.tipo]}</span>
        <Etiqueta tono={ESTADO_SOLICITUD[s.estado][0]}>{ESTADO_SOLICITUD[s.estado][1]}</Etiqueta>
      </header>
      <h2>{s.instalacion ?? s.cliente}{s.tipo === 'emergencia' ? ' · emergencia' : ''}</h2>
      <dl className="datos lineas">
        <div><dt>Cliente</dt><dd><Link to={`/admin/clientes/${s.cliente_id}`}>{s.cliente}</Link>{s.cliente_telefono ? <> · <a href={`tel:${s.cliente_telefono}`}>{s.cliente_telefono}</a></> : ''}</dd></div>
        {s.instalacion_id && <div><dt>Instalación</dt><dd><Link to={`/admin/instalaciones/${s.instalacion_id}`}>{s.instalacion_codigo}{s.potencia_kwp ? ` · ${Number(s.potencia_kwp).toLocaleString('es-CL')} kWp` : ''}</Link></dd></div>}
        <div><dt>Canal</dt><dd>{CANALES[s.canal]} · {fechaHora(s.created_at)}</dd></div>
        <div><dt>Suscripción</dt><dd>{s.suscripcion
          ? <Link to={`/admin/suscripciones/${s.suscripcion_id}`} className={s.periodos_adeudados ? 'texto-malo' : ''}>{s.suscripcion}{s.periodos_adeudados ? ' · pago pendiente' : ' · al día'}</Link>
          : <span className="suave">Sin suscripción{s.tipo === 'emergencia' ? ' (la emergencia se atiende igual)' : ''}</span>}</dd></div>
        {s.atendida_por && <div><dt>A cargo</dt><dd>{s.atendida_por}</dd></div>}
        {s.mantencion && <div><dt>Mantención</dt><dd><Link to={`/admin/mantenciones/${s.mantencion.id}`}>MNT-{String(s.mantencion.id).padStart(4, '0')} · {s.mantencion.estado} · {fechaCorta(s.mantencion.fecha_realizada ?? s.mantencion.fecha_programada)}</Link></dd></div>}
      </dl>
      <div className="cita"><small>Lo que escribió el cliente</small><p>{s.descripcion}</p></div>
      {abierta ? (
        <AreaTexto etiqueta="Responder (lo ve el cliente)" placeholder="Hola, ya vimos tu caso. Mañana a las 9:00 va un técnico a revisar el inversor." value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
      ) : s.respuesta && <div className="cita respuesta"><small>Respuesta de ENINTI</small><p>{s.respuesta}</p></div>}
      <Aviso>{falla}</Aviso>
      {abierta ? (
        <div className="acciones">
          {s.estado === 'nueva' && <button type="button" className="boton secundario chico" disabled={ocupado} onClick={() => accion('tomar', undefined, 'Solicitud tomada')}>Tomar</button>}
          {s.instalacion_id && s.tipo !== 'consulta' && !s.mantencion && (
            <Link to={`/admin/mantenciones?nueva=1&instalacion=${s.instalacion_id}&solicitud=${s.id}&tipo=${tipoMantencion}`} className="boton secundario chico">Agendar mantención</Link>
          )}
          <button type="button" className="boton secundario chico" disabled={ocupado} onClick={() => accion('responder', { respuesta, estado: 'resuelta' }, 'Solicitud resuelta')}>Resolver</button>
          <button type="button" className="boton suave chico" disabled={ocupado} onClick={() => accion('responder', { respuesta, estado: 'cerrada' }, 'Solicitud cerrada')}>Cerrar</button>
          <button type="button" className="boton primario chico" disabled={ocupado || !respuesta.trim()} onClick={() => accion('responder', { respuesta }, 'Respuesta enviada: el cliente la ve en su portal')}>Enviar respuesta</button>
        </div>
      ) : (
        <div className="acciones"><button type="button" className="boton secundario chico" disabled={ocupado} onClick={() => accion('reabrir', undefined, 'Solicitud reabierta')}>Reabrir</button></div>
      )}
    </section>
  );
}

// Anotar solicitud (091)
function Anotar({ cerrar, listo }: { cerrar: () => void; listo: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusqueda(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { datos: clientes } = useDatos<{ clientes: { id: number; nombre: string; rut: string | null }[] }>(`/admin/clientes?filtro=todos${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`);
  const [f, setF] = useState({ cliente_id: '', instalacion_id: '', tipo: 'emergencia', prioridad: '', canal: 'telefono', descripcion: '' });
  const { datos: ficha } = useDatos<{ instalaciones: { id: number; codigo: string; nombre: string | null }[] }>(f.cliente_id ? `/admin/clientes/${f.cliente_id}` : null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (ficha?.instalaciones.length === 1) setF((x) => ({ ...x, instalacion_id: String(ficha.instalaciones[0].id) })); }, [ficha]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try { const r = await api<{ id: number }>('/admin/solicitudes', { method: 'POST', body: f }); listo(r.id); }
    catch (err) { setError((err as Error).message); setGuardando(false); }
  };
  return (
    <Modal titulo="Anotar solicitud" cerrar={cerrar} ancho={680}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <label className="buscador-icono completo"><Search size={18} />
          <input className="buscador" type="search" placeholder="Buscar cliente por nombre o RUT" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
        <Selector etiqueta="Cliente" value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value, instalacion_id: '' })}>
          <option value="">Elige el cliente</option>
          {clientes?.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` · ${c.rut}` : ''}</option>)}
        </Selector>
        <Selector etiqueta="Instalación" value={f.instalacion_id} onChange={(e) => setF({ ...f, instalacion_id: e.target.value })} disabled={!ficha}>
          <option value="">{f.tipo === 'consulta' ? 'No aplica' : 'Elige la instalación'}</option>
          {ficha?.instalaciones.map((i) => <option key={i.id} value={i.id}>{i.nombre || i.codigo} · {i.codigo}</option>)}
        </Selector>
        <div className="completo segmentos">
          {Object.entries(TIPO_SOLICITUD).map(([v, t]) => <button key={v} type="button" className={f.tipo === v ? 'activo' : ''} onClick={() => setF({ ...f, tipo: v })}>{t}</button>)}
        </div>
        <Selector etiqueta="Canal" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
          {Object.entries(CANALES).filter(([v]) => v !== 'plataforma').map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Selector etiqueta="Prioridad" value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
          <option value="">Según el tipo</option>
          {Object.entries(PRIORIDAD).map(([v, [, t]]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <div className="completo"><AreaTexto etiqueta="¿Qué pasa?" placeholder="El inversor muestra una luz roja y no tienen energía desde la mañana." value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></div>
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Anotar'}</button>
        </div>
      </form>
    </Modal>
  );
}
