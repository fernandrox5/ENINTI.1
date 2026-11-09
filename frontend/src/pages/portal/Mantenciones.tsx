// T-31 · Mockups 027 a 032: mantenciones del cliente (próximas y realizadas), informe con fotos,
// calificación con estrellas (una sola vez) y "Pedir cotización" si se recomienda una inversión.
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, FileText, Star } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { AreaTexto, Aviso, Cargando, Etiqueta, Titulo, Vacio, Volver } from '../../componentes';
import { TIPOS_EQUIPO, TIPOS_MANTENCION, fechaCorta, hoyISO } from '../../formato';

interface Fila {
  id: number; tipo: string; estado: string; fecha_programada: string | null; fecha_realizada: string | null; hora_inicio: string | null; hora_fin: string | null;
  numero_en_plan: number | null; del_plan: number; calificacion_cliente: number | null; requiere_inversion: boolean;
  tecnico: string | null; tecnico_empresa: string | null; instalacion_id: number; instalacion: string;
}
interface Informe extends Fila {
  trabajo_realizado: string | null; hallazgos: string | null; recomendaciones: string | null; detalle_inversion: string | null; comentario_cliente: string | null;
  documentos: { id: number; tipo: string; nombre: string; url: string | null }[];
  equipos_retirados: { tipo: string; marca: string | null; modelo: string | null; motivo_retiro: string | null }[];
  cotizacion: { id: number; estado: string } | null;
}

const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DIA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const hora = (h: string | null) => (h ? h.slice(0, 5) : '');
const NOTAS = ['', 'Mala', 'Regular', 'Aceptable', 'Buena', 'Excelente'];
// "Limpieza de paneles. Revisión del inversor." → viñetas
const vinetas = (t: string | null) => (t ?? '').split(/\n|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/).map((x) => x.trim()).filter(Boolean);

function Calendarito({ f }: { f: string | null }) {
  if (!f) return <span className="calendarito vacio"><b>—</b>?</span>;
  const d = new Date(`${f}T12:00:00`);
  return <span className="calendarito"><small>{MES[d.getMonth()]}</small><b>{d.getDate()}</b><small>{DIA[d.getDay()]}</small></span>;
}

export function MantencionesPortal() {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'realizadas' ? 'realizadas' : 'proximas';
  const { datos, error, cargando } = useDatos<{ proximas: Fila[]; realizadas: Fila[] }>('/portal/mantenciones');
  if (cargando && !datos) return <Cargando />;
  const lista = datos ? datos[vista] : [];
  return (
    <div className="pagina-portal angosta">
      <Titulo fuerte="Mantenciones" />
      <div className="segmentos ancho">
        <button type="button" className={vista === 'proximas' ? 'activo' : ''} onClick={() => setParams({}, { replace: true })}>Próximas</button>
        <button type="button" className={vista === 'realizadas' ? 'activo' : ''} onClick={() => setParams({ vista: 'realizadas' }, { replace: true })}>Realizadas</button>
      </div>
      <Aviso>{error}</Aviso>
      {datos && (lista.length === 0
        ? <Vacio>{vista === 'proximas' ? 'No tienes mantenciones agendadas.' : 'Aún no tienes mantenciones realizadas.'}</Vacio>
        : (
          <ul className="lista-mantenciones">
            {lista.map((m) => {
              const atrasada = m.estado === 'programada' && m.fecha_programada && m.fecha_programada < hoyISO();
              return (
                <li key={m.id}>
                  <Link to={`/portal/mantenciones/${m.id}`}>
                    <Calendarito f={m.fecha_realizada ?? m.fecha_programada} />
                    <span className="lista-mantenciones-texto">
                      <strong>Mantención {TIPOS_MANTENCION[m.tipo].toLowerCase()}</strong>
                      <small>{m.instalacion}{m.hora_inicio ? ` · ${hora(m.hora_inicio)}${m.hora_fin ? ` a ${hora(m.hora_fin)}` : ''}` : ''}{m.numero_en_plan ? ` · ${m.numero_en_plan} de ${m.del_plan} del plan` : ''}</small>
                      {m.estado === 'realizada'
                        ? (m.calificacion_cliente ? <Etiqueta tono="buena">{'★'.repeat(m.calificacion_cliente)} Calificada</Etiqueta> : <Etiqueta tono="alerta">Califícala</Etiqueta>)
                        : atrasada ? <Etiqueta tono="alerta">Por reagendar</Etiqueta>
                          : m.tecnico ? <Etiqueta tono="buena" punto>Confirmada · {m.tecnico.split(' ')[0]}</Etiqueta> : <Etiqueta tono="neutra">Agendada</Etiqueta>}
                    </span>
                    <ChevronRight size={20} className="suave" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      <Link to="/portal/solicitudes?nueva=mantencion" className="boton suave">Pedir mantención</Link>
    </div>
  );
}

export function MantencionPortal() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [version, setVersion] = useState(0);
  const { datos: m, error, cargando } = useDatos<Informe>(`/portal/mantenciones/${id}?v=${version}`);
  const [aviso, setAviso] = useState('');
  const [falla, setFalla] = useState('');
  if (cargando && !m) return <Cargando />;
  if (!m) return <div className="pagina-portal angosta"><Volver a="/portal/mantenciones" /><Aviso>{error}</Aviso></div>;
  if (params.get('calificar') === '1' && m.estado === 'realizada' && !m.calificacion_cliente) {
    return <Calificar m={m} volver={() => setParams({}, { replace: true })} listo={() => { setParams({}, { replace: true }); setAviso('¡Gracias! Tu calificación nos ayuda a mejorar.'); setVersion((v) => v + 1); }} />;
  }
  const cotizar = async () => {
    setFalla('');
    try { await api(`/portal/mantenciones/${m.id}/cotizacion`, { method: 'POST' }); setAviso('Listo: ENINTI te enviará la cotización.'); setVersion((v) => v + 1); }
    catch (e) { setFalla((e as Error).message); }
  };
  const fotos = m.documentos.filter((d) => d.tipo === 'foto' && d.url);
  const otros = m.documentos.filter((d) => d.tipo !== 'foto' && d.url);

  if (m.estado === 'programada') return (
    <div className="pagina-portal angosta">
      <Volver a="/portal/mantenciones" />
      <p className="suave">{m.instalacion} · {TIPOS_MANTENCION[m.tipo]}</p>
      <h1 className="titulo-pagina">{m.fecha_programada ? new Date(`${m.fecha_programada}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Sin fecha agendada'}</h1>
      <section className="tarjeta">
        <dl className="datos lineas">
          <div><dt>Hora</dt><dd>{m.hora_inicio ? `${hora(m.hora_inicio)}${m.hora_fin ? ` a ${hora(m.hora_fin)}` : ''}` : 'Te avisaremos'}</dd></div>
          <div><dt>Técnico</dt><dd>{m.tecnico ? `${m.tecnico}${m.tecnico_empresa ? ` · ${m.tecnico_empresa}` : ''}` : 'Por asignar'}</dd></div>
          {m.numero_en_plan && <div><dt>Plan</dt><dd>{m.numero_en_plan} de {m.del_plan} mantenciones del año</dd></div>}
        </dl>
      </section>
      <p className="nota-info"><span>¿No puedes ese día? <Link to={`/portal/solicitudes?nueva=mantencion&instalacion=${m.instalacion_id}`}>Pide otra fecha</Link>.</span></p>
    </div>
  );

  return (
    <div className="pagina-portal angosta informe-portal">
      <Volver a="/portal/mantenciones?vista=realizadas" />
      <Aviso tipo="ok">{aviso}</Aviso>
      <p className="suave">{m.instalacion} · {TIPOS_MANTENCION[m.tipo]}</p>
      <h1 className="titulo-pagina">{new Date(`${m.fecha_realizada}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</h1>
      {m.tecnico && <p className="suave">Técnico: {m.tecnico}{m.tecnico_empresa ? ` · ${m.tecnico_empresa}` : ''}</p>}

      {m.trabajo_realizado && <><h2>Trabajo realizado</h2><ul>{vinetas(m.trabajo_realizado).map((t) => <li key={t}>{t}</li>)}</ul></>}
      {m.hallazgos && <><h2>Hallazgos</h2><ul>{vinetas(m.hallazgos).map((t) => <li key={t}>{t}</li>)}</ul></>}
      {m.recomendaciones && <><h2>Recomendaciones</h2><ul>{vinetas(m.recomendaciones).map((t) => <li key={t}>{t}</li>)}</ul></>}
      {m.equipos_retirados.length > 0 && (
        <><h2>Equipos reemplazados</h2><ul>{m.equipos_retirados.map((e, k) => <li key={k}>{TIPOS_EQUIPO[e.tipo]} {e.modelo ?? ''}{e.motivo_retiro ? ` · ${e.motivo_retiro}` : ''}</li>)}</ul></>
      )}

      {m.requiere_inversion && (
        <section className="aviso-portal alerta inversion">
          <span className="aviso-icono"><AlertTriangle size={20} /></span>
          <span><strong>Requiere inversión</strong><small className="suave">{m.detalle_inversion}</small>
            {m.cotizacion
              ? <Etiqueta tono="buena"><Check size={13} /> Cotización pedida</Etiqueta>
              : <button type="button" className="boton primario" onClick={cotizar}>Pedir cotización</button>}</span>
        </section>
      )}
      <Aviso>{falla}</Aviso>

      {(fotos.length > 0 || otros.length > 0) && <h2>Fotos e informe</h2>}
      {fotos.length > 0 && <div className="fotos">{fotos.map((d) => <a key={d.id} href={d.url!} target="_blank" rel="noreferrer"><img src={d.url!} alt={d.nombre} /></a>)}</div>}
      {otros.length > 0 && (
        <ul className="lista-menu">{otros.map((d) => (
          <li key={d.id}><a href={d.url!} target="_blank" rel="noreferrer"><FileText size={20} /> {d.nombre} <ChevronRight size={18} /></a></li>
        ))}</ul>
      )}

      {m.calificacion_cliente
        ? <p className="calificada"><span className="estrellas">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} className={n <= m.calificacion_cliente! ? 'llena' : ''} />)}</span>
          Calificaste esta mantención{m.comentario_cliente ? `: "${m.comentario_cliente}"` : ''}</p>
        : <button type="button" className="boton secundario" onClick={() => setParams({ calificar: '1' })}><Star size={18} /> Calificar esta mantención</button>}
    </div>
  );
}

function Calificar({ m, volver, listo }: { m: Informe; volver: () => void; listo: () => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nota) return setError('Elige de 1 a 5 estrellas');
    setEnviando(true);
    try { await api(`/portal/mantenciones/${m.id}/calificar`, { method: 'POST', body: { nota, comentario } }); listo(); }
    catch (err) { setError((err as Error).message); setEnviando(false); }
  };
  return (
    <form className="pagina-portal angosta" onSubmit={enviar} noValidate>
      <button type="button" className="volver" onClick={volver}>‹ Volver</button>
      <Titulo fuerte="¿Cómo estuvo la mantención?" />
      <p className="suave">{fechaCorta(m.fecha_realizada)} · {m.instalacion}{m.tecnico ? ` · ${m.tecnico}` : ''}</p>
      <div className="estrellas grandes" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} estrellas`} onClick={() => setNota(n)}>
            <Star size={44} className={n <= nota ? 'llena' : ''} />
          </button>
        ))}
      </div>
      <p className="centrado"><strong>{NOTAS[nota]}</strong></p>
      <AreaTexto etiqueta="Comentario (opcional)" placeholder="Puntual y explicó todo muy claro." value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <Aviso>{error}</Aviso>
      <button className="boton primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar calificación'}</button>
    </form>
  );
}
