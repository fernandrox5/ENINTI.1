// T-28 y T-32 · Mockup 089: detalle de la mantención (asignar técnico, reprogramar, cancelar con
// motivo) e informe de la visita, que la deja "realizada" y lo ve el cliente en su portal.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { FileText, Upload } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Modal, Selector, Volver } from '../../../componentes';
import { TIPOS_EQUIPO, TIPOS_MANTENCION, fechaCorta, hoyISO, pesos } from '../../../formato';
import { ESTADO_MANTENCION } from '../../../estados';
import { subirArchivo } from '../instalaciones/comun';
import { PedirTexto } from '../pagos/Pagos';
import type { FilaMantencion, OpcionesMantencion } from './Mantenciones';

interface Detalle extends FilaMantencion {
  trabajo_realizado: string | null; hallazgos: string | null; recomendaciones: string | null; requiere_inversion: boolean; detalle_inversion: string | null;
  costo_adicional: number; calificacion_cliente: number | null; comentario_cliente: string | null; del_plan: number;
  equipos_retirados: { id: number; tipo: string; marca: string | null; modelo: string | null; cantidad: number; motivo_retiro: string | null }[];
  documentos: { id: number; tipo: string; nombre: string; visible_cliente: boolean; created_at: string }[];
  anterior: { id: number; fecha_realizada: string; recomendaciones: string | null; requiere_inversion: boolean; detalle_inversion: string | null } | null;
  equipos_activos: { tipo: string; n: number }[];
}

const DIA = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const hora = (h: string | null) => (h ? h.slice(0, 5) : '');

export default function MantencionDetalle() {
  const { id } = useParams();
  const avisoAlLlegar = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [version, setVersion] = useState(0);
  const { datos: m, error, cargando } = useDatos<Detalle>(`/admin/mantenciones/${id}?v=${version}`);
  const { datos: op } = useDatos<OpcionesMantencion>('/admin/mantenciones/opciones');
  const [modal, setModal] = useState<'agenda' | 'cancelar' | null>(null);
  const [informe, setInforme] = useState(false);
  const [aviso, setAviso] = useState('');
  const listo = (t: string) => { setModal(null); setInforme(false); setAviso(t); setVersion((v) => v + 1); };

  if (cargando && !m) return <Cargando />;
  if (!m) return <><Volver a="/admin/mantenciones" texto="Calendario" /><Aviso>{error || 'Mantención no encontrada'}</Aviso></>;
  const fecha = m.fecha_realizada ?? m.fecha_programada;
  const atrasada = m.estado === 'programada' && (m.fecha_programada ?? '') < hoyISO();
  const [tono, texto] = atrasada ? ['mala' as const, 'Atrasada'] : ESTADO_MANTENCION[m.estado];
  const editable = m.estado === 'programada';
  const mostrarInforme = informe || m.estado === 'realizada';

  return (
    <>
      <Volver a="/admin/mantenciones" texto="Calendario" />
      <div className="ficha-cabecera">
        <div className="ficha-titulo">
          <h1>{TIPOS_MANTENCION[m.tipo]} <span className="suave">· {m.instalacion || m.direccion}</span></h1>
          <p>
            {fecha ? DIA(fecha) : 'Sin fecha'}{m.hora_inicio ? ` · ${hora(m.hora_inicio)}${m.hora_fin ? ` a ${hora(m.hora_fin)}` : ''}` : ''} ·
            <Link to={`/admin/instalaciones/${m.instalacion_id}`}>{m.instalacion_codigo}</Link> ·
            <Link to={`/admin/clientes/${m.cliente_id}`}>{m.cliente}</Link>
            <Etiqueta tono={tono}>{texto}</Etiqueta>
            <span className="codigo-chico">MNT-{String(m.id).padStart(4, '0')}</span>
          </p>
        </div>
      </div>
      {editable && (
        <div className="acciones">
          <button type="button" className="boton secundario chico" onClick={() => setModal('agenda')}>{m.tecnico ? 'Reprogramar o cambiar técnico' : 'Asignar técnico'}</button>
          <button type="button" className="boton peligro chico" onClick={() => setModal('cancelar')}>Cancelar</button>
          {!informe && <button type="button" className="boton primario chico" onClick={() => setInforme(true)}>Registrar como realizada</button>}
        </div>
      )}
      <Aviso tipo="ok">{aviso || avisoAlLlegar}</Aviso>
      {m.estado === 'cancelada' && <p className="nota-peligro">Cancelada{m.motivo_cancelacion ? `: ${m.motivo_cancelacion}` : ''}.</p>}

      <div className="grilla-3 arriba-alineado">
        <section className="tarjeta">
          <dl className="datos lineas">
            <div><dt>Técnico</dt><dd>{m.tecnico ? `${m.tecnico}${m.tecnico_empresa ? ` · ${m.tecnico_empresa}` : ''}` : <span className="texto-malo">Sin asignar</span>}</dd></div>
            <div><dt>Origen</dt><dd>{m.suscripcion ? <Link to={`/admin/suscripciones/${m.suscripcion_id}`}>{m.suscripcion} · {m.plan}{m.numero_en_plan ? ` (${m.numero_en_plan} de ${m.del_plan})` : ''}</Link> : 'Servicio aparte (sin suscripción)'}</dd></div>
            {!m.suscripcion && <div><dt>Valor del servicio</dt><dd>{m.valor_servicio !== null ? pesos(m.valor_servicio) : 'Por definir'}</dd></div>}
            {m.solicitud_id && <div><dt>Pedido del cliente</dt><dd><Link to={`/admin/solicitudes?id=${m.solicitud_id}`}>Ver pedido ›</Link></dd></div>}
          </dl>
        </section>
        <section className="tarjeta">
          <dl className="datos lineas">
            <div><dt>Dirección</dt><dd>{[m.direccion, m.localidad].filter(Boolean).join(', ')}</dd></div>
            <div><dt>Teléfono</dt><dd>{m.cliente_telefono ? <a href={`tel:${m.cliente_telefono}`}>{m.cliente_telefono}</a> : '—'}</dd></div>
            <div><dt>Equipos</dt><dd>{m.equipos_activos.length ? m.equipos_activos.map((e) => `${TIPOS_EQUIPO[e.tipo].toLowerCase()}${e.n > 1 ? ` (${e.n})` : ''}`).join(' · ') : 'Sin registrar'}</dd></div>
          </dl>
          {m.notas && <p className="nota-info"><span><strong>Notas:</strong> {m.notas}</span></p>}
        </section>
        {m.anterior ? (
          <section className="tarjeta resumen">
            <h3>Recomendación de la visita anterior</h3>
            <p className="suave">{fechaCorta(m.anterior.fecha_realizada)}</p>
            {m.anterior.recomendaciones && <p>{m.anterior.recomendaciones}</p>}
            {m.anterior.requiere_inversion && <p><strong>Inversión recomendada:</strong> {m.anterior.detalle_inversion}</p>}
          </section>
        ) : <span />}
      </div>

      {mostrarInforme && op && <Informe m={m} op={op} editable={m.estado !== 'cancelada'} cerrar={() => setInforme(false)} listo={listo} />}

      {modal === 'agenda' && op && <Agenda m={m} op={op} cerrar={() => setModal(null)} listo={() => listo('Mantención actualizada')} />}
      {modal === 'cancelar' && (
        <PedirTexto titulo="Cancelar mantención" etiqueta="Motivo de la cancelación" boton="Cancelar mantención" peligro largo
          nota="La mantención no se borra: queda cancelada con su motivo en el historial de la instalación."
          cerrar={() => setModal(null)} enviar={async (t) => { await api(`/admin/mantenciones/${m.id}/cancelar`, { method: 'POST', body: { motivo: t } }); listo('Mantención cancelada'); }} />
      )}
    </>
  );
}

function Agenda({ m, op, cerrar, listo }: { m: Detalle; op: OpcionesMantencion; cerrar: () => void; listo: () => void }) {
  const [f, setF] = useState({ fecha_programada: m.fecha_programada ?? hoyISO(), hora_inicio: hora(m.hora_inicio), tecnico_id: m.tecnico_id ? String(m.tecnico_id) : '', notas: m.notas ?? '' });
  const [error, setError] = useState('');
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(`/admin/mantenciones/${m.id}`, { method: 'PUT', body: f }); listo(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal titulo="Fecha y técnico" cerrar={cerrar} ancho={620}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <Campo etiqueta="Fecha" type="date" value={f.fecha_programada} onChange={(e) => setF({ ...f, fecha_programada: e.target.value })} />
        <Campo etiqueta="Hora (opcional)" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
        <div className="completo">
          <Selector etiqueta="Técnico" value={f.tecnico_id} onChange={(e) => setF({ ...f, tecnico_id: e.target.value })}>
            <option value="">Sin asignar todavía</option>
            {op.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.empresa ? ` · ${t.empresa}` : ''}</option>)}
          </Selector>
        </div>
        <div className="completo"><AreaTexto etiqueta="Notas para el técnico" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Informe({ m, op, editable, cerrar, listo }: { m: Detalle; op: OpcionesMantencion; editable: boolean; cerrar: () => void; listo: (t: string) => void }) {
  const realizada = m.estado === 'realizada';
  const [editando, setEditando] = useState(!realizada);
  const inicial = () => ({
    fecha_realizada: m.fecha_realizada ?? (m.fecha_programada && m.fecha_programada <= hoyISO() ? m.fecha_programada : hoyISO()),
    hora_inicio: hora(m.hora_inicio), hora_fin: hora(m.hora_fin), tecnico_id: m.tecnico_id ? String(m.tecnico_id) : '',
    trabajo_realizado: m.trabajo_realizado ?? '', hallazgos: m.hallazgos ?? '', recomendaciones: m.recomendaciones ?? '',
    requiere_inversion: m.requiere_inversion, detalle_inversion: m.detalle_inversion ?? '', costo_adicional: m.costo_adicional ? String(m.costo_adicional) : '',
  });
  const [f, setF] = useState(inicial);
  useEffect(() => { if (!editando) setF(inicial()); }, [m]); // eslint-disable-line react-hooks/exhaustive-deps
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const c = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await api(`/admin/mantenciones/${m.id}/informe`, { method: 'POST', body: f });
      for (const a of archivos) {
        await subirArchivo(m.instalacion_id, a, {
          nombre: `${TIPOS_MANTENCION[m.tipo]} ${fechaCorta(f.fecha_realizada)} · ${a.name.replace(/\.[^.]+$/, '')}`,
          tipo: a.type.startsWith('image/') ? 'foto' : 'informe', visible_cliente: true, mantencion_id: m.id,
        });
      }
      listo(realizada ? 'Informe actualizado' : 'Mantención registrada como realizada. El cliente ya ve el informe en su portal.');
    } catch (err) { setError((err as Error).message); setGuardando(false); }
  };
  const abrir = async (docId: number) => {
    try { const { url } = await api<{ url: string }>(`/admin/instalaciones/${m.instalacion_id}/documentos/${docId}/url`); window.open(url, '_blank', 'noopener'); }
    catch (err) { window.alert((err as Error).message); }
  };

  if (realizada && !editando) return (
    <section className="tarjeta informe">
      <header className="tarjeta-cabecera"><h2>Informe de la mantención</h2>
        <span className="acciones">{m.calificacion_cliente && <Etiqueta tono="buena">Calificación del cliente: {'★'.repeat(m.calificacion_cliente)}</Etiqueta>}
          {editable && <button type="button" className="boton secundario mini" onClick={() => setEditando(true)}>Corregir informe</button>}</span></header>
      <dl className="datos lineas">
        <div><dt>Realizada</dt><dd>{fechaCorta(m.fecha_realizada)}{m.hora_inicio ? ` · ${hora(m.hora_inicio)}${m.hora_fin ? ` a ${hora(m.hora_fin)}` : ''}` : ''} · {m.tecnico}</dd></div>
        <div><dt>Trabajo realizado</dt><dd>{m.trabajo_realizado}</dd></div>
        {m.hallazgos && <div><dt>Hallazgos</dt><dd>{m.hallazgos}</dd></div>}
        {m.recomendaciones && <div><dt>Recomendaciones</dt><dd>{m.recomendaciones}</dd></div>}
        {m.requiere_inversion && <div><dt>Inversión recomendada</dt><dd className="texto-malo">{m.detalle_inversion}</dd></div>}
        {m.costo_adicional > 0 && <div><dt>Costo adicional</dt><dd>{pesos(m.costo_adicional)}</dd></div>}
        {m.equipos_retirados.length > 0 && <div><dt>Equipos reemplazados</dt><dd>{m.equipos_retirados.map((e) => `${TIPOS_EQUIPO[e.tipo]} ${e.modelo ?? ''}`.trim()).join(', ')}</dd></div>}
      </dl>
      {m.comentario_cliente && <p className="nota-info"><span><strong>Comentario del cliente:</strong> {m.comentario_cliente}</span></p>}
      {m.documentos.length > 0 && (
        <ul className="lista-simple">{m.documentos.map((d) => (
          <li key={d.id}><span><FileText size={16} /> {d.nombre}</span><button type="button" className="boton secundario mini" onClick={() => abrir(d.id)}>Ver</button></li>
        ))}</ul>
      )}
    </section>
  );

  return (
    <form className="tarjeta informe" onSubmit={guardar} noValidate>
      <header className="tarjeta-cabecera"><h2>Informe de la mantención</h2><span className="suave">Lo verá el cliente en su portal</span></header>
      <div className="formulario tres">
        <Campo etiqueta="Fecha realizada" type="date" max={hoyISO()} value={f.fecha_realizada} onChange={c('fecha_realizada')} />
        <Campo etiqueta="Hora de inicio" type="time" value={f.hora_inicio} onChange={c('hora_inicio')} />
        <Campo etiqueta="Hora de término" type="time" value={f.hora_fin} onChange={c('hora_fin')} />
        <Selector etiqueta="Técnico" value={f.tecnico_id} onChange={c('tecnico_id')}>
          <option value="">Elige el técnico</option>
          {op.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.empresa ? ` · ${t.empresa}` : ''}</option>)}
        </Selector>
      </div>
      <AreaTexto etiqueta="Trabajo realizado" placeholder="Limpieza de los 12 paneles. Revisión del inversor y sus registros." value={f.trabajo_realizado} onChange={c('trabajo_realizado')} />
      <div className="formulario dos">
        <AreaTexto etiqueta="Hallazgos (opcional)" placeholder="La batería entrega 61 % de su capacidad original." value={f.hallazgos} onChange={c('hallazgos')} />
        <AreaTexto etiqueta="Recomendaciones (opcional)" placeholder="Planificar el reemplazo de la batería antes de marzo." value={f.recomendaciones} onChange={c('recomendaciones')} />
      </div>
      <div className="formulario dos">
        <div className="caja">
          <label className="check"><input type="checkbox" checked={f.requiere_inversion} onChange={(e) => setF({ ...f, requiere_inversion: e.target.checked })} /> <span><strong>¿Requiere inversión?</strong></span></label>
          <p className="suave">El cliente verá un aviso.</p>
          {f.requiere_inversion && <Campo etiqueta="Detalle de la inversión" placeholder="Reemplazo de batería" value={f.detalle_inversion} onChange={c('detalle_inversion')} />}
        </div>
        <div className="caja">
          <strong>¿Se reemplazó algún equipo?</strong>
          <Link to={`/admin/instalaciones/${m.instalacion_id}/reemplazar?mantencion=${m.id}`} className="boton primario mini">Registrar reemplazo de equipo ›</Link>
        </div>
      </div>
      <Campo etiqueta="Costo adicional (repuestos u otros, opcional)" type="number" min="0" value={f.costo_adicional} onChange={c('costo_adicional')} />
      <label className="archivo">
        <Upload size={20} />
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setArchivos([...(e.target.files ?? [])])} />
        <span>{archivos.length ? archivos.map((a) => a.name).join(', ') : 'Fotos e informe (se suben a Documentos de la instalación, visibles para el cliente)'}</span>
      </label>
      <Aviso>{error}</Aviso>
      <div className="botones">
        <button type="button" className="boton suave chico" onClick={() => (realizada ? setEditando(false) : cerrar())}>Cancelar</button>
        <button className="boton primario chico" disabled={guardando}>{guardando ? 'Guardando…' : realizada ? 'Guardar cambios' : 'Guardar informe'}</button>
      </div>
    </form>
  );
}
