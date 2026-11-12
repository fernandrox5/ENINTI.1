// T-29 · Mockups 090 y 091: solicitudes de los clientes con las emergencias primero. A la izquierda
// la lista y a la derecha el detalle (?id=): tomar, responder (lo ve el cliente), agendar la
// mantención, resolver o cerrar. "Anotar solicitud" registra las que llegan por teléfono o WhatsApp.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, Inbox, Plus, Search, Wrench, Zap } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Cargando, Etiqueta, Modal, Selector, Titulo, Vacio, type Tono } from '../../../componentes';
import { fechaCorta, fechaHora } from '../../../formato';
import { CANALES, TIPO_SOLICITUD } from '../../../estados';

interface Solicitud {
  id: number; tipo: string; prioridad: string; descripcion: string; canal: string; estado: string; respuesta: string | null; atendida_at: string | null;
  created_at: string; updated_at: string; cliente_id: number; cliente: string; cliente_telefono: string | null; cliente_email: string | null;
  instalacion_id: number | null; instalacion_codigo: string | null; instalacion: string | null; tipo_sistema: string | null; potencia_kwp: string | null;
  atendida_por: string | null; suscripcion_id: number | null; suscripcion: string | null; periodos_adeudados: number | null;
  mantencion: { id: number; estado: string; fecha_programada: string | null; fecha_realizada: string | null } | null;
}
export const PRIORIDAD: Record<string, [Tono, string]> = { critica: ['mala', 'Crítica'], alta: ['mala', 'Alta'], media: ['alerta', 'Media'], baja: ['neutra', 'Baja'] };
const ICONO = { emergencia: Zap, mantencion: Wrench } as const;

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
  const [vista, setVista] = useState<'pendientes' | 'atendidas'>('pendientes');
  const [version, setVersion] = useState(0);
  const [anotar, setAnotar] = useState(false);
  const [aviso, setAviso] = useState('');
  const { datos, error, cargando } = useDatos<{ solicitudes: Solicitud[]; conteo: { pendientes: number; emergencias: number } }>(
    `/admin/solicitudes?vista=${vista}&v=${version}`);
  const idSel = Number(params.get('id')) || datos?.solicitudes[0]?.id || 0;
  const elegir = (id: number) => setParams({ id: String(id) }, { replace: true });
  const listo = (m: string, cambiaLista = false) => { setAviso(m); setVersion((v) => v + 1); if (cambiaLista) setParams({}, { replace: true }); };
  const cambiarVista = (v: 'pendientes' | 'atendidas') => { setVista(v); setParams({}, { replace: true }); };

  return (
    <>
      <div className="encabezado">
        <Titulo icono={Inbox} fuerte="Solicitudes" suave="Pedidos de mantención y emergencias de los clientes" />
        <button type="button" className="boton primario chico" onClick={() => setAnotar(true)}><Plus size={18} /> Anotar solicitud</button>
      </div>
      <div className="segmentos">
        <button type="button" className={vista === 'pendientes' ? 'activo' : ''} onClick={() => cambiarVista('pendientes')}>
          Pendientes{datos ? ` · ${datos.conteo.pendientes}` : ''}</button>
        <button type="button" className={vista === 'atendidas' ? 'activo' : ''} onClick={() => cambiarVista('atendidas')}>Atendidas</button>
      </div>
      <Aviso tipo="ok">{aviso}</Aviso>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.solicitudes.length === 0 ? <Vacio>{vista === 'pendientes' ? 'No hay solicitudes pendientes.' : 'Aún no hay solicitudes atendidas.'}</Vacio> : (
        <div className="maestro-detalle">
          <ul className="lista-solicitudes">
            {datos.solicitudes.map((s) => {
              const Icono = ICONO[s.tipo as keyof typeof ICONO] ?? Wrench;
              return (
                <li key={s.id}>
                  <button type="button" className={`${s.id === idSel ? 'elegida' : ''} ${s.tipo}`} onClick={() => elegir(s.id)}>
                    <span className={`icono-solicitud ${s.tipo}`}><Icono size={20} /></span>
                    <span className="lista-solicitudes-texto"><strong>{TIPO_SOLICITUD[s.tipo]} · {s.cliente}</strong>
                      <small>{s.instalacion ?? s.instalacion_codigo ?? 'Sin instalación'} · {cuando(s.created_at)}</small></span>
                    {vista === 'pendientes' && (s.mantencion ? <Etiqueta tono="info">Visita agendada</Etiqueta>
                      : s.respuesta ? <Etiqueta tono="neutra">Respondida</Etiqueta>
                        : <Etiqueta tono={s.tipo === 'emergencia' ? 'mala' : 'alerta'}>Sin atender</Etiqueta>)}
                  </button>
                </li>
              );
            })}
          </ul>
          {idSel ? <Detalle key={`${idSel}-${version}`} id={idSel} listo={listo} /> : null}
        </div>
      ))}
      {anotar && <Anotar cerrar={() => setAnotar(false)} listo={(id) => { setAnotar(false); setVista('pendientes'); elegir(id); listo('Solicitud anotada'); }} />}
    </>
  );
}

// Detalle: agendar la visita, una sola respuesta al cliente (se puede corregir) y marcarla como atendida.
// Mantención o emergencia se atienden igual: la visita queda como una mantención (de emergencia si corresponde).
function Detalle({ id, listo }: { id: number; listo: (m: string, cambiaLista?: boolean) => void }) {
  const { datos: s, error } = useDatos<Solicitud>(`/admin/solicitudes/${id}`);
  const [respuesta, setRespuesta] = useState('');
  const [editando, setEditando] = useState(false);
  const [falla, setFalla] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (s) { setRespuesta(s.respuesta ?? ''); setEditando(!s.respuesta); } }, [s]);
  if (!s) return <section className="tarjeta">{error ? <Aviso>{error}</Aviso> : <Cargando />}</section>;
  const abierta = s.estado === 'nueva' || s.estado === 'en_proceso';
  const accion = async (ruta: string, body: object | undefined, mensaje: string, cambiaLista = false) => {
    setFalla('');
    setOcupado(true);
    try { await api(`/admin/solicitudes/${s.id}/${ruta}`, { method: 'POST', body }); listo(mensaje, cambiaLista); }
    catch (e) { setFalla((e as Error).message); setOcupado(false); }
  };
  const tipoMantencion = s.tipo === 'emergencia' ? 'emergencia' : 'correctiva';
  const sinCambios = respuesta.trim() === (s.respuesta ?? '').trim();
  const m = s.mantencion;

  return (
    <section className="tarjeta detalle-solicitud">
      <header className="tarjeta-cabecera">
        <span className="suave">{TIPO_SOLICITUD[s.tipo]} · {CANALES[s.canal]} · {fechaHora(s.created_at)}</span>
        <Etiqueta tono={abierta ? (s.tipo === 'emergencia' ? 'mala' : 'alerta') : 'buena'}>{abierta ? 'Pendiente' : 'Atendida'}</Etiqueta>
      </header>
      <h2>{s.instalacion ?? s.cliente}</h2>
      <dl className="datos lineas">
        <div><dt>Cliente</dt><dd><Link to={`/admin/clientes/${s.cliente_id}`}>{s.cliente}</Link>{s.cliente_telefono ? <> · <a href={`tel:${s.cliente_telefono}`}>{s.cliente_telefono}</a></> : ''}</dd></div>
        {s.instalacion_id && <div><dt>Instalación</dt><dd><Link to={`/admin/instalaciones/${s.instalacion_id}`}>{s.instalacion_codigo}{s.potencia_kwp ? ` · ${Number(s.potencia_kwp).toLocaleString('es-CL')} kWp` : ''}</Link></dd></div>}
        <div><dt>Plan</dt><dd>{s.suscripcion
          ? <Link to={`/admin/suscripciones/${s.suscripcion_id}`} className={s.periodos_adeudados ? 'texto-malo' : ''}>{s.periodos_adeudados ? 'Con pago pendiente' : 'Al día'}</Link>
          : <span className="suave">Sin suscripción{s.tipo === 'emergencia' ? ' (la emergencia se atiende igual)' : ''}</span>}</dd></div>
      </dl>
      <div className="cita"><small>Lo que escribió el cliente</small><p>{s.descripcion}</p></div>

      {m ? (
        <Link to={`/admin/mantenciones/${m.id}`} className="aviso-portal buena">
          <span className="aviso-icono"><CalendarDays size={20} /></span>
          <span><strong>{m.estado === 'realizada' ? `Visita realizada el ${fechaCorta(m.fecha_realizada)}` : m.estado === 'cancelada' ? 'Visita cancelada' : `Visita agendada para el ${fechaCorta(m.fecha_programada)}`}</strong><small>Ver la mantención ›</small></span>
        </Link>
      ) : abierta && s.instalacion_id ? (
        <Link to={`/admin/mantenciones?nueva=1&instalacion=${s.instalacion_id}&solicitud=${s.id}&tipo=${tipoMantencion}`} className={`boton chico ${s.tipo === 'emergencia' ? 'peligro' : 'secundario'}`}>
          <CalendarDays size={18} /> Agendar visita{s.tipo === 'emergencia' ? ' de emergencia' : ''}</Link>
      ) : null}

      {abierta && editando ? (
        <>
          <AreaTexto etiqueta="Respuesta al cliente (la ve en su portal)" placeholder="Hola, ya vimos tu caso. El jueves a las 9:00 va un técnico a revisar el inversor." value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
          <div className="acciones">
            {s.respuesta && <button type="button" className="boton suave chico" onClick={() => { setRespuesta(s.respuesta ?? ''); setEditando(false); }}>Cancelar</button>}
            <button type="button" className="boton secundario chico" disabled={ocupado || !respuesta.trim() || sinCambios}
              onClick={() => accion('responder', { respuesta }, s.respuesta ? 'Respuesta corregida' : 'Respuesta enviada: el cliente la ve en su portal')}>
              {s.respuesta ? 'Guardar cambio' : 'Enviar respuesta'}</button>
          </div>
        </>
      ) : s.respuesta ? (
        <div className="cita respuesta"><small>Respuesta enviada · {fechaHora(s.updated_at)}</small><p>{s.respuesta}</p>
          {abierta && <button type="button" className="enlace" onClick={() => setEditando(true)}>Corregir respuesta</button>}</div>
      ) : null}

      <Aviso>{falla}</Aviso>
      <div className="acciones">
        {abierta
          ? <button type="button" className="boton primario chico" disabled={ocupado} onClick={() => accion('responder', { respuesta: sinCambios ? '' : respuesta, estado: 'resuelta' }, 'Solicitud atendida', true)}><Check size={18} /> Marcar como atendida</button>
          : <button type="button" className="boton secundario chico" disabled={ocupado} onClick={() => accion('reabrir', undefined, 'Solicitud reabierta', true)}>Volver a pendientes</button>}
      </div>
    </section>
  );
}

// Anotar solicitud (091)
function Anotar({ cerrar, listo }: { cerrar: () => void; listo: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusqueda(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { datos: clientes } = useDatos<{ clientes: { id: number; nombre: string; rut: string | null }[] }>(`/admin/clientes?filtro=todos${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`);
  const [f, setF] = useState({ cliente_id: '', instalacion_id: '', tipo: 'mantencion', canal: 'whatsapp', descripcion: '' });
  const { datos: ficha } = useDatos<{ instalaciones: { id: number; codigo: string; nombre: string | null }[] }>(f.cliente_id ? `/admin/clientes/${f.cliente_id}` : null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const elegido = clientes?.clientes.find((c) => String(c.id) === f.cliente_id) ?? null;
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
        {elegido ? (
          <div className="completo fila-suscripcion">
            <span><strong>{elegido.nombre}</strong><small>{elegido.rut ?? 'Sin RUT'}</small></span>
            <button type="button" className="boton suave mini" onClick={() => setF({ ...f, cliente_id: '', instalacion_id: '' })}>Cambiar</button>
          </div>
        ) : (
          <div className="completo elegir-cliente">
            <label className="buscador-icono"><Search size={18} />
              <input className="buscador" type="search" placeholder="Escribe el nombre o RUT del cliente" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
            <div className="opciones-tarjeta">
              {clientes?.clientes.slice(0, 6).map((c) => (
                <button key={c.id} type="button" onClick={() => setF({ ...f, cliente_id: String(c.id), instalacion_id: '' })}>
                  <strong>{c.nombre}</strong><small>{c.rut ?? 'Sin RUT'}</small>
                </button>
              ))}
              {clientes && clientes.clientes.length === 0 && <p className="suave">No hay clientes que coincidan.</p>}
            </div>
          </div>
        )}
        <Selector etiqueta="Instalación" value={f.instalacion_id} onChange={(e) => setF({ ...f, instalacion_id: e.target.value })} disabled={!ficha}>
          <option value="">Elige la instalación</option>
          {ficha?.instalaciones.map((i) => <option key={i.id} value={i.id}>{i.nombre || i.codigo}</option>)}
        </Selector>
        <div className="completo segmentos">
          {Object.entries(TIPO_SOLICITUD).filter(([v]) => v !== 'consulta').map(([v, t]) => <button key={v} type="button" className={f.tipo === v ? 'activo' : ''} onClick={() => setF({ ...f, tipo: v })}>{t}</button>)}
        </div>
        <Selector etiqueta="¿Por dónde llegó?" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
          {Object.entries(CANALES).filter(([v]) => v !== 'plataforma').map(([v, t]) => <option key={v} value={v}>{t}</option>)}
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
