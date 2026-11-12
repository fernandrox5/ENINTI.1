// T-29 · Mockups 034 a 037: mis solicitudes, su detalle con la respuesta de ENINTI y la mantención
// agendada, y nueva solicitud (?nueva=mantencion|emergencia|consulta&instalacion=).
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Inbox, Info, Wrench, Zap } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { AreaTexto, Aviso, Cargando, Etiqueta, Titulo, Vacio, Volver } from '../../componentes';
import { fechaCorta, fechaHora } from '../../formato';
import { ESTADO_SOLICITUD, TIPO_SOLICITUD } from '../../estados';
import { useWhatsapp } from '../../contacto';

interface Solicitud {
  id: number; tipo: string; descripcion: string; estado: string; respuesta: string | null; created_at: string; updated_at: string;
  instalacion_id: number | null; instalacion: string | null;
  mantencion: { id: number; estado: string; fecha_programada: string | null; fecha_realizada: string | null; hora_inicio: string | null; tecnico: string | null } | null;
}
interface Datos { solicitudes: Solicitud[]; instalaciones: { id: number; nombre: string; con_plan: boolean }[] }
const ICONO = { emergencia: Zap, mantencion: Wrench, consulta: Info } as const;
const ESTADO_CLIENTE: Record<string, string> = { nueva: 'Recibida', en_proceso: 'En proceso', resuelta: 'Resuelta', cerrada: 'Cerrada' };

export function SolicitudesPortal() {
  const [params, setParams] = useSearchParams();
  const nueva = params.get('nueva');
  const { datos, error, cargando, recargar } = useDatos<Datos>('/portal/solicitudes');
  const [enviada, setEnviada] = useState<{ id: number; tipo: string } | null>(null);
  if (cargando && !datos) return <Cargando />;
  if (!datos) return <Aviso>{error}</Aviso>;
  if (nueva !== null) {
    return <Nueva datos={datos} tipoInicial={nueva} instalacion={params.get('instalacion')} volver={() => setParams({})}
      listo={(id, tipo) => { setParams({}); setEnviada({ id, tipo }); recargar(); }} />;
  }
  return (
    <div className="pagina-portal angosta">
      <Titulo icono={Inbox} fuerte="Solicitudes" />
      {enviada && (
        <div className="tarjeta enviada">
          <span className="icono-circulo chico"><Check size={28} /></span>
          <h2>Solicitud enviada</h2>
          <p className="suave">{enviada.tipo === 'emergencia'
            ? 'Las emergencias se atienden primero. Te contactaremos lo antes posible.'
            : 'La revisaremos y te responderemos aquí mismo.'}</p>
        </div>
      )}
      {datos.solicitudes.length === 0 ? <Vacio>Aún no tienes solicitudes.</Vacio> : (
        <ul className="lista-mantenciones">
          {datos.solicitudes.map((s) => {
            const Icono = ICONO[s.tipo as keyof typeof ICONO] ?? Info;
            return (
              <li key={s.id}>
                <Link to={`/portal/solicitudes/${s.id}`}>
                  <span className={`icono-solicitud ${s.tipo}`}><Icono size={22} /></span>
                  <span className="lista-mantenciones-texto">
                    <strong>{TIPO_SOLICITUD[s.tipo]}{s.instalacion ? ` · ${s.instalacion}` : ''}</strong>
                    <small>{s.descripcion.slice(0, 70)}{s.descripcion.length > 70 ? '…' : ''} · {fechaCorta(s.created_at)}</small>
                    <Etiqueta tono={ESTADO_SOLICITUD[s.estado][0]}>{ESTADO_CLIENTE[s.estado]}{s.respuesta && s.estado !== 'cerrada' ? ' · con respuesta' : ''}</Etiqueta>
                  </span>
                  <ChevronRight size={20} className="suave" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="acciones-rapidas">
        <button type="button" className="boton primario" onClick={() => setParams({ nueva: 'mantencion' })}><Wrench size={18} /> Nueva solicitud</button>
        <button type="button" className="boton peligro" onClick={() => setParams({ nueva: 'emergencia' })}><Zap size={18} /> Reportar emergencia</button>
      </div>
    </div>
  );
}

function Nueva({ datos, tipoInicial, instalacion, volver, listo }: {
  datos: Datos; tipoInicial: string; instalacion: string | null; volver: () => void; listo: (id: number, tipo: string) => void;
}) {
  const [f, setF] = useState({
    instalacion_id: instalacion ?? (datos.instalaciones.length === 1 ? String(datos.instalaciones[0].id) : ''),
    tipo: tipoInicial === 'emergencia' ? 'emergencia' : 'mantencion', descripcion: '',
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const wa = useWhatsapp();
  const elegida = datos.instalaciones.find((i) => String(i.id) === f.instalacion_id);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (f.tipo !== 'consulta' && !f.instalacion_id) return setError('Elige la instalación');
    setError('');
    setEnviando(true);
    try { const r = await api<{ id: number }>('/portal/solicitudes', { method: 'POST', body: f }); listo(r.id, f.tipo); }
    catch (err) { setError((err as Error).message); setEnviando(false); }
  };
  return (
    <form className="pagina-portal angosta" onSubmit={enviar} noValidate>
      <button type="button" className="volver" onClick={volver}>‹ Volver</button>
      <Titulo fuerte="Nueva solicitud" />
      <h2 className="subtitulo">Instalación</h2>
      <div className="opciones-tarjeta">
        {datos.instalaciones.map((i) => (
          <button key={i.id} type="button" className={f.instalacion_id === String(i.id) ? 'elegida' : ''} onClick={() => setF({ ...f, instalacion_id: String(i.id) })}>
            <strong>{i.nombre}</strong><small>{i.con_plan ? 'Con plan de mantención' : 'Sin plan'}</small>
          </button>
        ))}
      </div>
      <h2 className="subtitulo">Tipo</h2>
      <div className="segmentos ancho">
        {Object.entries(TIPO_SOLICITUD).filter(([v]) => v !== 'consulta').map(([v, t]) => <button key={v} type="button" className={f.tipo === v ? 'activo' : ''} onClick={() => setF({ ...f, tipo: v })}>{t}</button>)}
      </div>
      {f.tipo === 'emergencia' && (
        <p className="nota-peligro"><Zap size={16} /> ¿Es muy urgente? {wa ? <>Escríbenos también por <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>.</> : 'Llámanos también.'}</p>
      )}
      {f.tipo === 'mantencion' && elegida && !elegida.con_plan && (
        <p className="nota-info"><span>Sin plan: la visita se cobra aparte.</span></p>
      )}
      {wa && <p className="suave">¿Solo quieres hacer una consulta? Escríbenos por <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>.</p>}
      <AreaTexto etiqueta="¿Qué está pasando?"
        placeholder={f.tipo === 'emergencia' ? 'El inversor muestra una luz roja y no tenemos energía desde la mañana.' : f.tipo === 'mantencion' ? 'Los paneles están con mucho polvo, ¿pueden venir a limpiarlos?' : 'Quiero saber si conviene agregar una batería.'}
        value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
      <Aviso>{error}</Aviso>
      <button className={`boton ${f.tipo === 'emergencia' ? 'peligro lleno' : 'primario'}`} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</button>
    </form>
  );
}

export function SolicitudPortal() {
  const { id } = useParams();
  const { datos: s, error, cargando } = useDatos<Solicitud>(`/portal/solicitudes/${id}`);
  if (cargando && !s) return <Cargando />;
  if (!s) return <div className="pagina-portal angosta"><Volver a="/portal/solicitudes" /><Aviso>{error}</Aviso></div>;
  const m = s.mantencion;
  return (
    <div className="pagina-portal angosta">
      <Volver a="/portal/solicitudes" />
      <p className="suave">{TIPO_SOLICITUD[s.tipo]}{s.instalacion ? ` · ${s.instalacion}` : ''}</p>
      <div className="encabezado"><h1 className="titulo-pagina">{ESTADO_CLIENTE[s.estado]}</h1><Etiqueta tono={ESTADO_SOLICITUD[s.estado][0]}>{ESTADO_CLIENTE[s.estado]}</Etiqueta></div>
      <div className="cita"><small>Lo que escribiste · {fechaHora(s.created_at)}</small><p>{s.descripcion}</p></div>
      {s.respuesta
        ? <div className="cita respuesta"><small>Respuesta de ENINTI · {fechaHora(s.updated_at)}</small><p>{s.respuesta}</p></div>
        : <p className="suave">Aún no tenemos respuesta. {s.tipo === 'emergencia' ? 'Las emergencias se atienden primero.' : 'Te responderemos aquí mismo.'}</p>}
      {m && (
        <Link to={`/portal/mantenciones/${m.id}`} className="aviso-portal buena">
          <span className="aviso-icono"><Wrench size={20} /></span>
          <span><strong>{m.estado === 'realizada' ? `Visita realizada el ${fechaCorta(m.fecha_realizada)}` : `Visita agendada para el ${fechaCorta(m.fecha_programada)}${m.hora_inicio ? ` a las ${m.hora_inicio.slice(0, 5)}` : ''}`}</strong>
            <small>{m.tecnico ? `Técnico: ${m.tecnico} · ` : ''}Ver detalle ›</small></span>
        </Link>
      )}
    </div>
  );
}
