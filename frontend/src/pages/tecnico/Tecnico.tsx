// Panel del técnico (pensado para el celular): sus visitas de hoy, atrasadas, próximas y realizadas;
// el detalle para llegar (dirección, mapa, teléfono, equipos, recomendación anterior) y el informe con
// fotos de la cámara. Lo que guarda lo ve ENINTI en el calendario y el cliente en su portal.
import { useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { Camera, Check, ChevronRight, LogOut, MapPin, Phone } from 'lucide-react';
import { api } from '../../api';
import { useSesion } from '../../sesion';
import { useDatos } from '../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Titulo, Vacio, Volver } from '../../componentes';
import { SISTEMAS, TIPOS_EQUIPO, TIPOS_MANTENCION, fechaCorta, hoyISO, pesos } from '../../formato';

interface Visita {
  id: number; tipo: string; estado: string; fecha_programada: string | null; fecha_realizada: string | null; hora_inicio: string | null; hora_fin: string | null;
  notas: string | null; numero_en_plan: number | null; instalacion_id: number; instalacion_codigo: string; instalacion: string; direccion: string;
  latitud: string | null; longitud: string | null; tipo_sistema: string | null; potencia_kwp: string | null; localidad: string | null;
  cliente: string; cliente_telefono: string | null;
}
interface Detalle extends Visita {
  trabajo_realizado: string | null; hallazgos: string | null; recomendaciones: string | null; requiere_inversion: boolean; detalle_inversion: string | null; costo_adicional: number;
  equipos: { tipo: string; marca: string | null; modelo: string | null; cantidad: number; potencia_unitaria_w: string | null; capacidad_kwh: string | null; fin_vida_util: string | null }[];
  anterior: { fecha_realizada: string; hallazgos: string | null; recomendaciones: string | null; detalle_inversion: string | null; tecnico: string | null } | null;
  documentos: { id: number; tipo: string; nombre: string; url: string | null }[];
}

const hora = (h: string | null) => (h ? h.slice(0, 5) : '');
const DIA = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const mapa = (v: Pick<Visita, 'latitud' | 'longitud' | 'direccion' | 'localidad'>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.latitud && v.longitud ? `${v.latitud},${v.longitud}` : `${v.direccion}, ${v.localidad ?? 'Calama'}, Chile`)}`;

export function PanelTecnico() {
  const { usuario, salir } = useSesion();
  return (
    <div className="panel-tecnico">
      <header className="tecnico-cabecera">
        <Link to="/tecnico" className="portal-marca"><img src="/syntia-icono.png" alt="" className="marca-sol" /> <strong>Syntia</strong> <small className="suave">Técnico</small></Link>
        <span className="suave">{usuario?.nombre.split(' ')[0]}</span>
        <button type="button" className="icono-boton chico" aria-label="Cerrar sesión" onClick={salir}><LogOut size={18} /></button>
      </header>
      <main className="tecnico-pagina"><Outlet /></main>
    </div>
  );
}

function TarjetaVisita({ v }: { v: Visita }) {
  const fecha = v.fecha_realizada ?? v.fecha_programada;
  const atrasada = v.estado === 'programada' && (v.fecha_programada ?? '') < hoyISO();
  return (
    <li>
      <Link to={`/tecnico/visitas/${v.id}`} className={`visita ${v.tipo} ${atrasada ? 'atrasada' : ''}`}>
        <span className="visita-hora">{v.hora_inicio ? hora(v.hora_inicio) : fecha ? fechaCorta(fecha).split(' ').slice(0, 2).join(' ') : '—'}</span>
        <span className="lista-mantenciones-texto">
          <strong>{v.instalacion}</strong>
          <small>{TIPOS_MANTENCION[v.tipo]} · {v.cliente} · {[v.direccion, v.localidad].filter(Boolean).join(', ')}</small>
          {v.estado === 'realizada' ? <Etiqueta tono="buena"><Check size={12} /> Informe enviado</Etiqueta>
            : atrasada ? <Etiqueta tono="mala">Atrasada · {fechaCorta(v.fecha_programada)}</Etiqueta>
              : v.tipo === 'emergencia' ? <Etiqueta tono="mala">Emergencia</Etiqueta> : null}
        </span>
        <ChevronRight size={20} className="suave" />
      </Link>
    </li>
  );
}

export function Visitas() {
  const { datos, error, cargando } = useDatos<{ tecnico: { nombre: string }; programadas: Visita[]; realizadas: Visita[] }>('/tecnico/visitas');
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  if (cargando && !datos) return <Cargando />;
  if (!datos) return <Aviso>{error}</Aviso>;
  const hoy = hoyISO();
  const atrasadas = datos.programadas.filter((v) => v.fecha_programada && v.fecha_programada < hoy);
  const deHoy = datos.programadas.filter((v) => v.fecha_programada === hoy);
  const proximas = datos.programadas.filter((v) => !v.fecha_programada || v.fecha_programada > hoy);
  const grupo = (titulo: string, lista: Visita[]) => lista.length > 0 && (
    <><h2 className="subtitulo">{titulo}</h2><ul className="lista-mantenciones">{lista.map((v) => <TarjetaVisita key={v.id} v={v} />)}</ul></>
  );
  return (
    <>
      <Titulo fuerte={`Hola, ${datos.tecnico.nombre.split(' ')[0]}.`} suave={deHoy.length ? `Hoy tienes ${deHoy.length} ${deHoy.length === 1 ? 'visita' : 'visitas'}.` : 'Hoy no tienes visitas.'} />
      <Aviso tipo="ok">{aviso}</Aviso>
      {grupo('Atrasadas · falta el informe', atrasadas)}
      {grupo(`Hoy · ${DIA(hoy)}`, deHoy)}
      {grupo('Próximas', proximas)}
      {datos.programadas.length === 0 && <Vacio>No tienes visitas pendientes asignadas.</Vacio>}
      {grupo('Realizadas (últimos 60 días)', datos.realizadas)}
    </>
  );
}

// Sube una foto directo a Storage y la registra en la visita
async function subirFoto(visitaId: number, archivo: File, nombre: string) {
  if (archivo.size > 15 * 1024 * 1024) throw new Error(`${archivo.name} pesa más de 15 MB`);
  const { ruta, url } = await api<{ ruta: string; url: string }>(`/tecnico/visitas/${visitaId}/fotos/subida`, { method: 'POST', body: { archivo: archivo.name } });
  const cuerpo = new FormData();
  cuerpo.append('cacheControl', '3600');
  cuerpo.append('', archivo);
  const r = await fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: cuerpo });
  if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}`);
  await api(`/tecnico/visitas/${visitaId}/fotos`, { method: 'POST', body: { ruta, nombre, tipo: archivo.type.startsWith('image/') ? 'foto' : 'informe' } });
}

export function VisitaTecnico() {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const { datos: v, error, cargando } = useDatos<Detalle>(`/tecnico/visitas/${id}?v=${version}`);
  const [editando, setEditando] = useState(false);
  if (cargando && !v) return <Cargando />;
  if (!v) return <><Volver a="/tecnico" texto="Mis visitas" /><Aviso>{error}</Aviso></>;
  const realizada = v.estado === 'realizada';
  return (
    <>
      <Volver a="/tecnico" texto="Mis visitas" />
      <p className="suave">{TIPOS_MANTENCION[v.tipo]}{v.numero_en_plan ? ` · ${v.numero_en_plan}ª del plan` : ''} · MNT-{String(v.id).padStart(4, '0')}</p>
      <h1 className="titulo-pagina">{v.instalacion}</h1>
      <p className="suave">{(v.fecha_realizada ?? v.fecha_programada) ? DIA((v.fecha_realizada ?? v.fecha_programada)!) : 'Sin fecha'}{v.hora_inicio ? ` · ${hora(v.hora_inicio)}${v.hora_fin ? ` a ${hora(v.hora_fin)}` : ''}` : ''}</p>

      <div className="acciones-rapidas">
        <a href={mapa(v)} target="_blank" rel="noreferrer" className="boton secundario chico"><MapPin size={18} /> Cómo llegar</a>
        {v.cliente_telefono && <a href={`tel:${v.cliente_telefono}`} className="boton secundario chico"><Phone size={18} /> Llamar a {v.cliente.replace(/\[[^\]]*\]\s*/g, '').split(' ')[0]}</a>}
      </div>
      <section className="tarjeta">
        <dl className="datos lineas">
          <div><dt>Cliente</dt><dd>{v.cliente}</dd></div>
          <div><dt>Dirección</dt><dd>{[v.direccion, v.localidad].filter(Boolean).join(', ')}</dd></div>
          <div><dt>Sistema</dt><dd>{[v.tipo_sistema && SISTEMAS[v.tipo_sistema], v.potencia_kwp && `${Number(v.potencia_kwp).toLocaleString('es-CL')} kWp`].filter(Boolean).join(' · ') || '—'}</dd></div>
        </dl>
        {v.notas && <p className="nota-info"><span><strong>Indicaciones:</strong> {v.notas}</span></p>}
      </section>
      {v.equipos.length > 0 && (
        <section className="tarjeta">
          <h2>Equipos</h2>
          <ul className="lista-simple">{v.equipos.map((e, k) => (
            <li key={k}><span>{TIPOS_EQUIPO[e.tipo]}{e.cantidad > 1 ? ` × ${e.cantidad}` : ''}</span>
              <span className="suave">{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</span>
              {e.fin_vida_util && e.fin_vida_util <= hoyISO().replace(/^(\d{4})/, (a) => String(Number(a) + 1)) && <Etiqueta tono="alerta">Fin de vida {fechaCorta(e.fin_vida_util)}</Etiqueta>}</li>
          ))}</ul>
        </section>
      )}
      {v.anterior && (v.anterior.recomendaciones || v.anterior.hallazgos) && (
        <section className="tarjeta resumen">
          <h3>Visita anterior · {fechaCorta(v.anterior.fecha_realizada)}{v.anterior.tecnico ? ` · ${v.anterior.tecnico}` : ''}</h3>
          {v.anterior.hallazgos && <p><strong>Hallazgos:</strong> {v.anterior.hallazgos}</p>}
          {v.anterior.recomendaciones && <p><strong>Recomendó:</strong> {v.anterior.recomendaciones}</p>}
          {v.anterior.detalle_inversion && <p><strong>Inversión:</strong> {v.anterior.detalle_inversion}</p>}
        </section>
      )}

      {realizada && !editando ? (
        <section className="tarjeta informe">
          <header className="tarjeta-cabecera"><h2>Tu informe</h2><button type="button" className="boton secundario mini" onClick={() => setEditando(true)}>Corregir</button></header>
          <dl className="datos lineas">
            <div><dt>Trabajo</dt><dd>{v.trabajo_realizado}</dd></div>
            {v.hallazgos && <div><dt>Hallazgos</dt><dd>{v.hallazgos}</dd></div>}
            {v.recomendaciones && <div><dt>Recomendaciones</dt><dd>{v.recomendaciones}</dd></div>}
            {v.requiere_inversion && <div><dt>Inversión</dt><dd className="texto-malo">{v.detalle_inversion}</dd></div>}
            {v.costo_adicional > 0 && <div><dt>Costo adicional</dt><dd>{pesos(v.costo_adicional)}</dd></div>}
          </dl>
          {v.documentos.length > 0 && <div className="fotos">{v.documentos.filter((d) => d.url).map((d) => <a key={d.id} href={d.url!} target="_blank" rel="noreferrer">{d.tipo === 'foto' ? <img src={d.url!} alt={d.nombre} /> : d.nombre}</a>)}</div>}
        </section>
      ) : (
        <Informe v={v} listo={() => { setEditando(false); setVersion((x) => x + 1); }} />
      )}
    </>
  );
}

function Informe({ v, listo }: { v: Detalle; listo: () => void }) {
  const [f, setF] = useState({
    fecha_realizada: v.fecha_realizada ?? (v.fecha_programada && v.fecha_programada < hoyISO() ? v.fecha_programada : hoyISO()),
    hora_inicio: hora(v.hora_inicio), hora_fin: hora(v.hora_fin), trabajo_realizado: v.trabajo_realizado ?? '', hallazgos: v.hallazgos ?? '',
    recomendaciones: v.recomendaciones ?? '', requiere_inversion: v.requiere_inversion, detalle_inversion: v.detalle_inversion ?? '',
    costo_adicional: v.costo_adicional ? String(v.costo_adicional) : '',
  });
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState('');
  const c = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setGuardando('Guardando informe…');
    try {
      await api(`/tecnico/visitas/${v.id}/informe`, { method: 'POST', body: f });
      for (const [k, a] of fotos.entries()) {
        setGuardando(`Subiendo foto ${k + 1} de ${fotos.length}…`);
        await subirFoto(v.id, a, `${TIPOS_MANTENCION[v.tipo]} ${fechaCorta(f.fecha_realizada)} · foto ${k + 1}`);
      }
      setGuardando('');
      setFotos([]);
      listo();
    } catch (err) { setError((err as Error).message); setGuardando(''); }
  };
  return (
    <form className="tarjeta informe" onSubmit={enviar} noValidate>
      <h2>Informe de la visita</h2>
      <div className="formulario dos">
        <Campo etiqueta="Fecha" type="date" max={hoyISO()} value={f.fecha_realizada} onChange={c('fecha_realizada')} />
        <div className="formulario dos">
          <Campo etiqueta="Llegué" type="time" value={f.hora_inicio} onChange={c('hora_inicio')} />
          <Campo etiqueta="Terminé" type="time" value={f.hora_fin} onChange={c('hora_fin')} />
        </div>
      </div>
      <AreaTexto etiqueta="¿Qué hiciste?" placeholder="Limpieza de los 12 paneles. Revisión del inversor y sus registros." value={f.trabajo_realizado} onChange={c('trabajo_realizado')} />
      <AreaTexto etiqueta="¿Qué encontraste? (opcional)" placeholder="La batería entrega 61 % de su capacidad." value={f.hallazgos} onChange={c('hallazgos')} />
      <AreaTexto etiqueta="¿Qué recomiendas? (opcional)" placeholder="Cambiar la batería antes de marzo." value={f.recomendaciones} onChange={c('recomendaciones')} />
      <label className="check"><input type="checkbox" checked={f.requiere_inversion} onChange={(e) => setF({ ...f, requiere_inversion: e.target.checked })} /> <span><strong>Requiere una inversión</strong> (el cliente verá un aviso para pedir cotización)</span></label>
      {f.requiere_inversion && <Campo etiqueta="¿Qué inversión?" placeholder="Reemplazo de batería" value={f.detalle_inversion} onChange={c('detalle_inversion')} />}
      <Campo etiqueta="Costo adicional en repuestos (opcional)" type="number" min="0" inputMode="numeric" value={f.costo_adicional} onChange={c('costo_adicional')} />
      <label className="archivo camara">
        <Camera size={22} />
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFotos([...fotos, ...(e.target.files ?? [])])} />
        <span>{fotos.length ? `${fotos.length} ${fotos.length === 1 ? 'foto lista' : 'fotos listas'} para subir` : 'Tomar fotos'}</span>
      </label>
      {v.documentos.length > 0 && <p className="suave">Ya subiste {v.documentos.length} {v.documentos.length === 1 ? 'archivo' : 'archivos'}.</p>}
      <Aviso>{error}</Aviso>
      <button className="boton primario" disabled={Boolean(guardando)}>{guardando || (v.estado === 'realizada' ? 'Guardar cambios' : 'Enviar informe')}</button>
    </form>
  );
}
