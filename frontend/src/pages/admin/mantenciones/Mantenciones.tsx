// T-28 · Mockups 085 a 088: agenda de mantenciones por mes, semana o lista, con filtros por técnico
// y tipo, y el formulario para agendar (también se abre con ?nueva=1&instalacion=).
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Modal, Selector, Titulo, Vacio } from '../../../componentes';
import { TIPOS_MANTENCION, fechaCorta, hoyISO } from '../../../formato';
import { ESTADO_MANTENCION } from '../../../estados';

type Vista = 'mes' | 'semana' | 'lista';
export interface FilaMantencion {
  id: number; tipo: string; estado: string; fecha_programada: string | null; fecha_realizada: string | null; hora_inicio: string | null; hora_fin: string | null;
  numero_en_plan: number | null; valor_servicio: number | null; notas: string | null; motivo_cancelacion: string | null; solicitud_id: number | null;
  tecnico_id: number | null; tecnico: string | null; tecnico_empresa: string | null;
  instalacion_id: number; instalacion_codigo: string; instalacion: string | null; direccion: string; localidad: string | null;
  cliente_id: number; cliente: string; cliente_telefono: string | null; suscripcion_id: number | null; suscripcion: string | null; plan: string | null;
}
interface Agenda { mantenciones: FilaMantencion[]; sin_fecha: FilaMantencion[]; atrasadas: number; sin_tecnico: number }
export interface OpcionesMantencion {
  tecnicos: { id: number; nombre: string; empresa: string | null }[];
  instalaciones: { id: number; codigo: string; nombre: string | null; direccion: string; cliente: string; suscripcion_id: number | null; suscripcion: string | null }[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TIPO_CORTO: Record<string, string> = { preventiva: 'Prev.', correctiva: 'Correc.', emergencia: 'Emergencia' };

// Fechas como texto AAAA-MM-DD (sin zonas horarias)
const aFecha = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deFecha = (f: string) => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };
const sumarDias = (f: string, n: number) => { const d = deFecha(f); d.setDate(d.getDate() + n); return aFecha(d); };
const lunes = (f: string) => { const d = deFecha(f); return sumarDias(f, -((d.getDay() + 6) % 7)); };
const primeroDelMes = (f: string) => `${f.slice(0, 8)}01`;
const finDelMes = (f: string) => { const d = deFecha(primeroDelMes(f)); d.setMonth(d.getMonth() + 1); d.setDate(0); return aFecha(d); };
export const fechaDe = (m: Pick<FilaMantencion, 'fecha_realizada' | 'fecha_programada'>) => m.fecha_realizada ?? m.fecha_programada ?? '';
const hora = (h: string | null) => (h ? h.slice(0, 5) : '');

function rango(vista: Vista, ancla: string): [string, string] {
  if (vista === 'semana') { const l = lunes(ancla); return [l, sumarDias(l, 6)]; }
  if (vista === 'mes') { const l = lunes(primeroDelMes(ancla)); return [l, sumarDias(lunes(finDelMes(ancla)), 6)]; }
  return [primeroDelMes(ancla), finDelMes(ancla)];
}

// Color del evento: realizada (verde), emergencia (rojo), correctiva (gris) o preventiva (amarillo)
export const claseEvento = (m: Pick<FilaMantencion, 'estado' | 'tipo'>) =>
  m.estado === 'realizada' ? 'realizada' : m.estado === 'cancelada' ? 'cancelada' : m.tipo;

function Evento({ m, completo }: { m: FilaMantencion; completo?: boolean }) {
  const atrasada = m.estado === 'programada' && (m.fecha_programada ?? '') < hoyISO();
  return (
    <Link to={`/admin/mantenciones/${m.id}`} className={`evento ${claseEvento(m)} ${atrasada ? 'atrasada' : ''}`} title={`${m.instalacion || m.instalacion_codigo} · ${TIPOS_MANTENCION[m.tipo]} · ${m.tecnico ?? 'sin técnico'}`}>
      {m.estado === 'realizada' && <Check size={13} />}
      {m.tipo === 'emergencia' && m.estado !== 'realizada' ? 'Emergencia · ' : ''}
      {m.instalacion || m.instalacion_codigo} · {completo ? `${hora(m.hora_inicio) || 'sin hora'} · ${m.tecnico ?? 'sin técnico'}` : m.tecnico ? m.tecnico.split(' ')[0] : m.tipo === 'emergencia' ? '' : TIPO_CORTO[m.tipo]}
    </Link>
  );
}

export default function Mantenciones() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [vista, setVista] = useState<Vista>(() => (window.innerWidth < 700 ? 'lista' : 'mes'));
  const [ancla, setAncla] = useState(hoyISO());
  const [tecnico, setTecnico] = useState('');
  const [tipo, setTipo] = useState('');
  const [desde, hasta] = rango(vista, ancla);
  const q = new URLSearchParams({ desde, hasta });
  if (tecnico) q.set('tecnico', tecnico);
  if (tipo) q.set('tipo', tipo);
  const { datos, error, cargando } = useDatos<Agenda>(`/admin/mantenciones?${q}`);
  const { datos: op } = useDatos<OpcionesMantencion>('/admin/mantenciones/opciones');
  const nueva = params.get('nueva') === '1';
  const cerrarNueva = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const mover = (n: number) => {
    if (vista === 'semana') setAncla(sumarDias(ancla, 7 * n));
    else { const d = deFecha(primeroDelMes(ancla)); d.setMonth(d.getMonth() + n); setAncla(aFecha(d)); }
  };
  const d0 = deFecha(ancla);
  const titulo = vista === 'semana'
    ? `Semana del ${fechaCorta(desde)}.`
    : `${MESES[d0.getMonth()][0].toUpperCase()}${MESES[d0.getMonth()].slice(1)} ${d0.getFullYear()}.`;
  const porDia = (f: string) => datos?.mantenciones.filter((m) => fechaDe(m) === f) ?? [];
  const dias = Array.from({ length: Math.round((deFecha(hasta).getTime() - deFecha(desde).getTime()) / 864e5) + 1 }, (_, k) => sumarDias(desde, k));

  return (
    <>
      <div className="encabezado">
        <Titulo icono={CalendarDays} fuerte="Mantenciones." suave={titulo} />
        <button type="button" className="boton primario chico" onClick={() => setParams({ nueva: '1' })}><Plus size={18} /> Nueva mantención</button>
      </div>
      <div className="filtros">
        <button type="button" className="icono-boton chico" aria-label="Anterior" onClick={() => mover(-1)}><ChevronLeft size={18} /></button>
        <button type="button" className="boton secundario mini" onClick={() => setAncla(hoyISO())}>Hoy</button>
        <button type="button" className="icono-boton chico" aria-label="Siguiente" onClick={() => mover(1)}><ChevronRight size={18} /></button>
        <span className="leyenda"><i className="preventiva" />Preventiva <i className="correctiva" />Reparación <i className="emergencia" />Emergencia <i className="realizada" />Realizada</span>
        <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} aria-label="Técnico">
          <option value="">Todos los técnicos</option><option value="sin">Sin técnico</option>
          {op?.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_MANTENCION).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <div className="segmentos empujar">
          {(['mes', 'semana', 'lista'] as Vista[]).map((v) => (
            <button key={v} type="button" className={vista === v ? 'activo' : ''} onClick={() => setVista(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>
      {datos && (datos.atrasadas > 0 || datos.sin_tecnico > 0) && (
        <p className="nota-info"><span>
          {datos.atrasadas > 0 && <><strong>{datos.atrasadas}</strong> {datos.atrasadas === 1 ? 'mantención atrasada' : 'mantenciones atrasadas'} (programadas en una fecha que ya pasó, sin informe). </>}
          {datos.sin_tecnico > 0 && <><strong>{datos.sin_tecnico}</strong> {datos.sin_tecnico === 1 ? 'próxima sin técnico asignado' : 'próximas sin técnico asignado'}.</>}
        </span></p>
      )}
      <Aviso>{error}</Aviso>

      {cargando && !datos ? <Cargando /> : datos && (vista === 'lista' ? (
        datos.mantenciones.length === 0 ? <Vacio>No hay mantenciones este mes.</Vacio> : (
          <div className="tabla"><table>
            <thead><tr><th>Fecha</th><th>Instalación</th><th>Cliente</th><th>Tipo</th><th>Técnico</th><th>Origen</th><th>Estado</th></tr></thead>
            <tbody>{datos.mantenciones.map((m) => (
              <tr key={m.id} className="clic" onClick={() => navegar(`/admin/mantenciones/${m.id}`)}>
                <td>{fechaCorta(fechaDe(m))}{m.hora_inicio && <small>{hora(m.hora_inicio)}</small>}</td>
                <td><strong>{m.instalacion || m.instalacion_codigo}</strong><small>{[m.direccion, m.localidad].filter(Boolean).join(' · ')}</small></td>
                <td>{m.cliente}</td>
                <td><span className={`punto-tipo ${claseEvento({ ...m, estado: 'programada' })}`} />{TIPOS_MANTENCION[m.tipo]}</td>
                <td>{m.tecnico ?? <span className="texto-malo">Sin técnico</span>}</td>
                <td>{m.suscripcion ? `${m.plan}${m.numero_en_plan ? ` (${m.numero_en_plan}ª)` : ''}` : 'Sin suscripción'}</td>
                <td><Etiqueta tono={ESTADO_MANTENCION[m.estado][0]}>{m.estado === 'programada' && fechaDe(m) < hoyISO() ? 'Atrasada' : ESTADO_MANTENCION[m.estado][1]}</Etiqueta></td>
              </tr>
            ))}</tbody>
          </table></div>
        )
      ) : (
        <div className={`calendario ${vista}`}>
          {DIAS.map((d) => <div key={d} className="calendario-dia-nombre">{d}</div>)}
          {dias.map((f) => {
            const fuera = vista === 'mes' && f.slice(0, 7) !== ancla.slice(0, 7);
            return (
              <div key={f} className={`calendario-celda ${fuera ? 'fuera' : ''} ${f === hoyISO() ? 'hoy' : ''}`}>
                <span className="calendario-numero">{Number(f.slice(8))}</span>
                {porDia(f).map((m) => <Evento key={m.id} m={m} completo={vista === 'semana'} />)}
              </div>
            );
          })}
        </div>
      ))}

      {datos && datos.sin_fecha.length > 0 && (
        <section className="tarjeta">
          <h2>Por agendar</h2>
          <ul className="lista-simple">{datos.sin_fecha.map((m) => (
            <li key={m.id}><span><strong>{m.instalacion || m.instalacion_codigo}</strong> <small className="suave">{TIPOS_MANTENCION[m.tipo]} · {m.cliente}</small></span>
              <Link to={`/admin/mantenciones/${m.id}`} className="boton secundario mini">Agendar</Link></li>
          ))}</ul>
        </section>
      )}

      {nueva && op && (
        <NuevaMantencion op={op} instalacion={params.get('instalacion')} fecha={params.get('fecha')} solicitud={params.get('solicitud')} tipoInicial={params.get('tipo')}
          cerrar={cerrarNueva} listo={(id, enPlan) => navegar(`/admin/mantenciones/${id}`, { state: { aviso: enPlan ? 'Mantención agendada dentro del plan' : 'Mantención agendada como servicio aparte' } })} />
      )}
    </>
  );
}

export function NuevaMantencion({ op, instalacion, fecha, solicitud, tipoInicial, cerrar, listo }: {
  op: OpcionesMantencion; instalacion: string | null; fecha?: string | null; solicitud?: string | null; tipoInicial?: string | null;
  cerrar: () => void; listo: (id: number, enPlan: boolean) => void;
}) {
  const [f, setF] = useState({
    instalacion_id: instalacion ?? '', tipo: tipoInicial && TIPOS_MANTENCION[tipoInicial] ? tipoInicial : 'preventiva',
    fecha_programada: fecha ?? hoyISO(), hora_inicio: '', tecnico_id: '', valor_servicio: '', notas: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const i = op.instalaciones.find((x) => String(x.id) === f.instalacion_id);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.instalacion_id) return setError('Elige la instalación');
    setError('');
    setGuardando(true);
    try {
      const r = await api<{ id: number; en_plan: boolean }>('/admin/mantenciones', { method: 'POST', body: { ...f, solicitud_id: solicitud } });
      listo(r.id, r.en_plan);
    } catch (err) { setError((err as Error).message); setGuardando(false); }
  };
  return (
    <Modal titulo="Nueva mantención" cerrar={cerrar} ancho={680}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <div className="completo">
          <Selector etiqueta="Instalación" value={f.instalacion_id} onChange={(e) => setF({ ...f, instalacion_id: e.target.value })}>
            <option value="">Elige la instalación</option>
            {op.instalaciones.map((x) => <option key={x.id} value={x.id}>{x.nombre || x.direccion} · {x.codigo} · {x.cliente} · {x.suscripcion ?? 'sin suscripción'}</option>)}
          </Selector>
        </div>
        <div className="completo segmentos">
          {Object.entries(TIPOS_MANTENCION).map(([v, t]) => <button key={v} type="button" className={f.tipo === v ? 'activo' : ''} onClick={() => setF({ ...f, tipo: v })}>{t}</button>)}
        </div>
        <Campo etiqueta="Fecha" type="date" value={f.fecha_programada} onChange={(e) => setF({ ...f, fecha_programada: e.target.value })} />
        <Campo etiqueta="Hora (opcional)" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
        <Selector etiqueta="Técnico" value={f.tecnico_id} onChange={(e) => setF({ ...f, tecnico_id: e.target.value })}>
          <option value="">Sin asignar todavía</option>
          {op.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.empresa ? ` · ${t.empresa}` : ''}</option>)}
        </Selector>
        {i && !i.suscripcion_id
          ? <Campo etiqueta="Valor del servicio (opcional)" type="number" min="0" value={f.valor_servicio} onChange={(e) => setF({ ...f, valor_servicio: e.target.value })} />
          : <span />}
        <div className="completo"><AreaTexto etiqueta="Notas para el técnico (opcional)" placeholder="Acceso por el portón lateral, llamar antes de llegar" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
        {i && (
          <p className={`completo ${i.suscripcion_id ? 'nota-info' : 'nota-alerta'}`}><span>{i.suscripcion_id
            ? <>Queda dentro del plan de <strong>{i.suscripcion}</strong>.</>
            : <>Esta instalación no tiene suscripción: la mantención queda como <strong>servicio aparte</strong>.</>}</span></p>
        )}
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={guardando}>{guardando ? 'Agendando…' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  );
}
