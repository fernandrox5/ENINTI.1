// T-24 · Mockups 056 a 061: ficha de la instalación con sus pestañas
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Campo, Cargando, Etiqueta, Modal, Pestanas, Selector, Vacio, Volver } from '../../../componentes';
import { TIPOS_EQUIPO, TIPOS_MANTENCION, fechaCorta, pesos, FRECUENCIAS } from '../../../formato';
import { ESTADO_MANTENCION, estadoSuscripcion, situacionInstalacion } from '../../../estados';
import { CamposEquipo, EQUIPO_VACIO, SISTEMAS_LARGO, describirEquipo, equipoParaApi, fechaOGuion, vidaUtil, type DatosEquipo, type Opciones, subirArchivo } from './comun';

interface Equipo {
  id: number; tipo: string; marca: string | null; modelo: string | null; cantidad: number; potencia_unitaria_w: string | null; capacidad_kwh: string | null;
  numero_serie: string | null; fecha_instalacion: string | null; garantia_hasta: string | null; vida_util_anios: number | null; fin_vida_util: string | null;
  activo: boolean; fecha_retiro: string | null; motivo_retiro: string | null; reemplaza_a_id: number | null; reemplaza_modelo: string | null; reemplaza_tipo: string | null;
}
interface Suscripcion {
  id: number; codigo: string; estado: string; tipo_nombre: string; monto_pactado: number; frecuencia_pago: string; fecha_inicio: string; fecha_termino: string;
  fecha_cierre: string | null; motivo_cierre: string | null; dias_restantes: number; periodos_pagados: number; periodos_adeudados: number; monto_adeudado: number;
  pagado_hasta: string | null; pagos_por_validar: number; suscripcion_anterior_id: number | null; proxima_mantencion: string | null; version_condiciones: string | null;
}
export interface FichaInstalacion {
  id: number; codigo: string; nombre: string | null; direccion: string; localidad_id: number | null; localidad: string | null; comuna: string | null;
  latitud: string | null; longitud: string | null; fecha_instalacion: string | null; potencia_kwp: string | null; tipo_sistema: string | null;
  instalada_por_eninti: boolean; instalador_id: number | null; instalador: string | null; instalador_empresa: string | null; notas: string | null; activa: boolean;
  cliente_id: number; cliente: string; cliente_email: string | null;
  equipos: Equipo[];
  documentos: { id: number; tipo: string; nombre: string; visible_cliente: boolean; created_at: string; subido_por: string | null }[];
  suscripciones: Suscripcion[];
  mantenciones: { id: number; tipo: string; estado: string; fecha_programada: string | null; fecha_realizada: string | null; numero_en_plan: number | null; valor_servicio: number | null; tecnico: string | null; suscripcion_codigo: string | null; plan: string | null }[];
}
type Pestana = 'resumen' | 'equipos' | 'documentos' | 'mantenciones' | 'suscripciones';
const TIPOS_DOCUMENTO: Record<string, string> = { plano: 'Plano', foto: 'Foto', contrato: 'Contrato', informe: 'Informe', otro: 'Otro' };

export default function InstalacionFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { datos: i, error, cargando, recargar } = useDatos<FichaInstalacion>(`/admin/instalaciones/${id}`);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [modal, setModal] = useState<'editar' | 'equipo' | 'documento' | null>(null);
  const [aviso, setAviso] = useState('');

  if (cargando && !i) return <Cargando />;
  if (!i) return <><Volver a="/admin/instalaciones" texto="Instalaciones" /><Aviso>{error || 'Instalación no encontrada'}</Aviso></>;

  const vigente = i.suscripciones.find((s) => s.estado === 'vigente') ?? null;
  const [tono, texto] = situacionInstalacion(vigente ? { suscripcion_id: vigente.id, dias_restantes: vigente.dias_restantes, periodos_adeudados: vigente.periodos_adeudados, pagos_por_validar: vigente.pagos_por_validar } : {});
  const activos = i.equipos.filter((e) => e.activo);
  const listo = (m: string) => { setModal(null); setAviso(m); recargar(); };

  const cambiarActiva = async () => {
    if (!window.confirm(i.activa ? `¿Desactivar ${i.nombre || i.codigo}? Sus datos se conservan.` : `¿Reactivar ${i.nombre || i.codigo}?`)) return;
    try {
      await api(`/admin/instalaciones/${i.id}/activa`, { method: 'POST', body: { activa: !i.activa } });
      setAviso(i.activa ? 'Instalación desactivada' : 'Instalación reactivada');
      recargar();
    } catch (e) { window.alert((e as Error).message); }
  };

  const abrirDocumento = async (docId: number) => {
    try {
      const { url } = await api<{ url: string }>(`/admin/instalaciones/${i.id}/documentos/${docId}/url`);
      window.open(url, '_blank', 'noopener');
    } catch (e) { window.alert((e as Error).message); }
  };
  const visibilidad = async (docId: number, visible: boolean) => {
    await api(`/admin/instalaciones/${i.id}/documentos/${docId}`, { method: 'PATCH', body: { visible_cliente: visible } });
    recargar();
  };
  const eliminarDocumento = async (docId: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar "${nombre}"? El archivo se borra.`)) return;
    await api(`/admin/instalaciones/${i.id}/documentos/${docId}`, { method: 'DELETE' });
    setAviso('Documento eliminado');
    recargar();
  };

  return (
    <>
      <Volver a="/admin/instalaciones" texto="Instalaciones" />
      <div className="ficha-cabecera">
        <span className="foto-instalacion" aria-hidden="true" />
        <div className="ficha-titulo">
          <h1>{i.nombre || i.direccion}</h1>
          <p>
            <Link to={`/admin/clientes/${i.cliente_id}`}>{i.cliente}</Link> · {i.localidad || 'Sin localidad'}
            {' '}<Etiqueta tono={tono} punto={tono !== 'neutra'}>{vigente ? texto.replace(/^Vence/, 'Suscripción vence') : 'Sin suscripción'}</Etiqueta>
            {!i.activa && <Etiqueta tono="mala">Desactivada</Etiqueta>}
            <span className="codigo-chico">{i.codigo}</span>
          </p>
        </div>
        <div className="acciones">
          <button type="button" className="boton suave chico" onClick={() => setModal('editar')}>Editar datos</button>
          <Link to={`/admin/mantenciones?nueva=1&instalacion=${i.id}`} className="boton primario chico">Agendar mantención</Link>
        </div>
      </div>
      <Aviso tipo="ok">{aviso}</Aviso>

      <Pestanas<Pestana> valor={pestana} cambiar={setPestana} opciones={[
        ['resumen', 'Resumen'], ['equipos', 'Equipos', activos.length], ['documentos', 'Documentos', i.documentos.length],
        ['mantenciones', 'Mantenciones', i.mantenciones.length], ['suscripciones', 'Suscripciones', i.suscripciones.length],
      ]} />

      {pestana === 'resumen' && (
        <div className="resumen-instalacion">
          <section className="tarjeta">
            <h2>La instalación</h2>
            <div className="mosaico-datos">
              <div><span>Potencia</span><strong>{i.potencia_kwp ? `${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : '—'}</strong></div>
              <div><span>Sistema</span><strong>{i.tipo_sistema ? SISTEMAS_LARGO[i.tipo_sistema] : '—'}</strong></div>
              <div><span>Instalada el</span><strong>{fechaOGuion(i.fecha_instalacion)}</strong></div>
              <div><span>Instaló</span><strong>{i.instalada_por_eninti ? ['ENINTI', i.instalador].filter(Boolean).join(' · ') : `Otro instalador${i.instalador ? ` · ${i.instalador}` : ''}`}</strong></div>
              <div className="ancho"><span>Dirección</span><strong>{i.localidad && !i.direccion.includes(i.localidad) ? `${i.direccion}, ${i.localidad}` : i.direccion}</strong>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.latitud && i.longitud ? `${i.latitud},${i.longitud}` : `${i.direccion}, ${i.localidad ?? ''}, Chile`)}`} target="_blank" rel="noreferrer">Ver en el mapa ›</a></div>
            </div>
            {i.notas && <p className="nota-instalacion"><strong>Referencia:</strong> {i.notas}</p>}
          </section>

          <section className="tarjeta">
            <h2>Suscripción</h2>
            {vigente ? (
              <>
                <div className="suscripcion-resumen">
                  <strong>{vigente.tipo_nombre}</strong>
                  <span>{pesos(vigente.monto_pactado)} {FRECUENCIAS[vigente.frecuencia_pago]}</span>
                </div>
                <dl className="datos lineas">
                  <div><dt>Pago</dt><dd className={vigente.periodos_adeudados > 0 ? 'texto-malo' : ''}>{vigente.periodos_adeudados > 0 ? 'Pendiente' : vigente.pagado_hasta ? `Al día hasta el ${fechaCorta(vigente.pagado_hasta)}` : 'Sin pagos'}</dd></div>
                  <div><dt>Próxima mantención</dt><dd>{fechaOGuion(vigente.proxima_mantencion)}</dd></div>
                  <div><dt>Vence</dt><dd>{fechaCorta(vigente.fecha_termino)}</dd></div>
                </dl>
                <Link to={`/admin/suscripciones/${vigente.id}`} className="enlace">Ver la suscripción ›</Link>
              </>
            ) : (
              <p className="suave">No tiene suscripción. El cliente la contrata desde su portal{i.suscripciones.length ? `; antes tuvo ${i.suscripciones.length}.` : '.'}</p>
            )}
          </section>
          <button type="button" className="enlace-peligro" onClick={cambiarActiva}>{i.activa ? 'Desactivar instalación' : 'Reactivar instalación'}</button>
        </div>
      )}

      {pestana === 'equipos' && (
        <>
          <div className="encabezado">
            <span className="suave">{activos.length} {activos.length === 1 ? 'equipo activo' : 'equipos activos'}{i.equipos.length > activos.length ? ` · ${i.equipos.length - activos.length} retirado(s)` : ''}</span>
            <div className="acciones">
              <button type="button" className="boton secundario mini" onClick={() => setModal('equipo')}><Plus size={16} /> Agregar equipo</button>
              {activos.length > 0 && <Link to={`/admin/instalaciones/${i.id}/reemplazar`} className="boton primario mini">Reemplazar equipo</Link>}
            </div>
          </div>
          {i.equipos.length === 0 ? <Vacio>Aún no hay equipos registrados.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Tipo</th><th>Equipo</th><th>Marca</th><th>N° de serie</th><th>Instalado</th><th>Garantía</th><th>Vida útil</th></tr></thead>
              <tbody>{i.equipos.map((e) => {
                const [t, v] = vidaUtil(e);
                return (
                  <tr key={e.id} className={e.activo ? '' : 'retirado'}>
                    <td>{TIPOS_EQUIPO[e.tipo]}</td>
                    <td><strong>{describirEquipo(e)}</strong>
                      {e.reemplaza_a_id && <small>Reemplazó a {describirEquipo({ tipo: e.reemplaza_tipo ?? e.tipo, modelo: e.reemplaza_modelo })}</small>}
                      {!e.activo && <small>Retirado {fechaOGuion(e.fecha_retiro)} · {e.motivo_retiro}</small>}</td>
                    <td>{e.marca || '—'}</td>
                    <td>{e.numero_serie || '—'}</td>
                    <td>{fechaOGuion(e.fecha_instalacion)}</td>
                    <td>{e.garantia_hasta ? (e.garantia_hasta < new Date().toISOString().slice(0, 10) ? 'Vencida' : `Hasta ${e.garantia_hasta.slice(0, 4)}`) : '—'}</td>
                    <td><Etiqueta tono={t}>{v}</Etiqueta></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </>
      )}

      {pestana === 'documentos' && (
        <>
          <div className="encabezado"><span className="suave">{i.documentos.length} {i.documentos.length === 1 ? 'documento' : 'documentos'}</span>
            <button type="button" className="boton primario mini" onClick={() => setModal('documento')}><Upload size={16} /> Subir documento</button></div>
          {i.documentos.length === 0 ? <Vacio>Sin documentos. Sube planos, fotos, contratos o informes.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Visible para el cliente</th><th /></tr></thead>
              <tbody>{i.documentos.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.nombre}</strong>{d.subido_por && <small>Subió {d.subido_por}</small>}</td>
                  <td>{TIPOS_DOCUMENTO[d.tipo]}</td>
                  <td>{fechaCorta(d.created_at)}</td>
                  <td><label className="check"><input type="checkbox" checked={d.visible_cliente} onChange={(ev) => visibilidad(d.id, ev.target.checked)} /> {d.visible_cliente ? 'Sí' : 'No'}</label></td>
                  <td><div className="acciones sin-corte">
                    <button type="button" className="boton secundario mini" onClick={() => abrirDocumento(d.id)}>Ver</button>
                    <button type="button" className="boton peligro mini" onClick={() => eliminarDocumento(d.id, d.nombre)}>Eliminar</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}

      {pestana === 'suscripciones' && (i.suscripciones.length === 0 ? <Vacio>Nunca ha tenido suscripción. El cliente la contrata desde su portal.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Plan</th><th>Desde</th><th>Hasta</th><th>Estado</th></tr></thead>
          <tbody>{[...i.suscripciones].reverse().map((x) => (
            <tr key={x.id} className="clic" onClick={() => navegar(`/admin/suscripciones/${x.id}`)}>
              <td><strong>{x.tipo_nombre}</strong><small>{pesos(x.monto_pactado)} {FRECUENCIAS[x.frecuencia_pago]}</small></td>
              <td>{fechaCorta(x.fecha_inicio)}</td>
              <td>{fechaCorta(x.fecha_cierre ?? x.fecha_termino)}</td>
              <td><Etiqueta tono={estadoSuscripcion(x)[0]}>{estadoSuscripcion(x)[1]}</Etiqueta>{x.motivo_cierre && <small>{x.motivo_cierre}</small>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}

      {pestana === 'mantenciones' && (i.mantenciones.length === 0 ? <Vacio>Sin mantenciones.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Origen</th><th>Estado</th></tr></thead>
          <tbody>{i.mantenciones.map((m) => (
            <tr key={m.id} className="clic" onClick={() => navegar(`/admin/mantenciones/${m.id}`)}>
              <td>{fechaOGuion(m.fecha_realizada ?? m.fecha_programada)}</td>
              <td>{TIPOS_MANTENCION[m.tipo]}</td>
              <td>{m.tecnico || 'Sin técnico'}</td>
              <td>{m.plan ? `${m.plan}${m.numero_en_plan ? ` (${m.numero_en_plan}ª del plan)` : ''}` : m.valor_servicio ? `Cobrada aparte · ${pesos(m.valor_servicio)}` : 'Sin suscripción'}</td>
              <td><Etiqueta tono={ESTADO_MANTENCION[m.estado][0]}>{ESTADO_MANTENCION[m.estado][1]}</Etiqueta></td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}

      {modal === 'editar' && <EditarInstalacion i={i} cerrar={() => setModal(null)} listo={() => listo('Cambios guardados')} />}
      {modal === 'equipo' && <AgregarEquipo instalacionId={i.id} cerrar={() => setModal(null)} listo={() => listo('Equipo agregado')} />}
      {modal === 'documento' && <SubirDocumento instalacionId={i.id} cerrar={() => setModal(null)} listo={() => listo('Documento subido')} />}
    </>
  );
}

function EditarInstalacion({ i, cerrar, listo }: { i: FichaInstalacion; cerrar: () => void; listo: () => void }) {
  const { datos: op } = useDatos<Opciones>('/admin/instalaciones/opciones');
  const [f, setF] = useState({
    nombre: i.nombre ?? '', direccion: i.direccion, localidad_id: i.localidad_id ? String(i.localidad_id) : '', latitud: i.latitud ?? '', longitud: i.longitud ?? '',
    fecha_instalacion: i.fecha_instalacion ?? '', potencia_kwp: i.potencia_kwp ?? '', tipo_sistema: i.tipo_sistema ?? '',
    instalada_por_eninti: i.instalada_por_eninti, instalador_id: i.instalador_id ? String(i.instalador_id) : '', notas: i.notas ?? '',
  });
  const [error, setError] = useState('');
  const c = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(`/admin/instalaciones/${i.id}`, { method: 'PUT', body: f }); listo(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal titulo="Editar datos técnicos" cerrar={cerrar} ancho={700}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <CamposInstalacion f={f} c={c} setF={setF} op={op} />
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton secundario chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico">Guardar cambios</button>
        </div>
      </form>
    </Modal>
  );
}

export interface DatosInstalacion {
  nombre: string; direccion: string; localidad_id: string; latitud: string; longitud: string; fecha_instalacion: string;
  potencia_kwp: string; tipo_sistema: string; instalada_por_eninti: boolean; instalador_id: string; notas: string;
}

// Campos de la instalación (edición y paso 2 del alta)
export function CamposInstalacion({ f, c, setF, op, codigo }: {
  f: DatosInstalacion; c: (k: keyof DatosInstalacion) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  setF: (f: DatosInstalacion) => void; op: Opciones | null; codigo?: string;
}) {
  return (
    <>
      <Campo etiqueta="Nombre de la instalación" placeholder="Casa Los Aromos" value={f.nombre} onChange={c('nombre')} />
      {codigo !== undefined && <Campo etiqueta="Código" value={codigo} disabled ayuda="Se genera solo al crear" />}
      <Campo etiqueta="Dirección" value={f.direccion} onChange={c('direccion')} required />
      <Selector etiqueta="Localidad" value={f.localidad_id} onChange={c('localidad_id')}>
        <option value="">Sin indicar</option>
        {op?.localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.comuna})</option>)}
      </Selector>
      <Campo etiqueta="Fecha de instalación" type="date" value={f.fecha_instalacion} onChange={c('fecha_instalacion')} />
      <Campo etiqueta="Potencia (kWp)" type="number" step="0.01" min="0" value={f.potencia_kwp} onChange={c('potencia_kwp')} />
      <Selector etiqueta="Tipo de sistema" value={f.tipo_sistema} onChange={c('tipo_sistema')}>
        <option value="">Sin indicar</option>
        {Object.entries(SISTEMAS_LARGO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </Selector>
      <Selector etiqueta="Técnico instalador" value={f.instalador_id} onChange={c('instalador_id')}>
        <option value="">Sin indicar</option>
        {op?.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.empresa ? ` · ${t.empresa}` : ''}</option>)}
      </Selector>
      <div className="completo"><Campo etiqueta="Referencia y notas" placeholder="Casa esquina, portón verde" value={f.notas} onChange={c('notas')} /></div>
      <label className="check completo">
        <input type="checkbox" checked={f.instalada_por_eninti} onChange={(e) => setF({ ...f, instalada_por_eninti: e.target.checked })} />
        <span>La instaló ENINTI</span>
      </label>
    </>
  );
}

function AgregarEquipo({ instalacionId, cerrar, listo }: { instalacionId: number; cerrar: () => void; listo: () => void }) {
  const [e, setE] = useState<DatosEquipo>({ ...EQUIPO_VACIO, vida_util_anios: '25' });
  const [error, setError] = useState('');
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    try { await api(`/admin/instalaciones/${instalacionId}/equipos`, { method: 'POST', body: equipoParaApi(e) }); listo(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal titulo="Agregar equipo" cerrar={cerrar} ancho={760}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <CamposEquipo e={e} cambiar={setE} />
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton secundario chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico">Agregar equipo</button>
        </div>
      </form>
    </Modal>
  );
}

function SubirDocumento({ instalacionId, cerrar, listo }: { instalacionId: number; cerrar: () => void; listo: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [f, setF] = useState({ nombre: '', tipo: 'plano', visible_cliente: true });
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!archivo) return setError('Elige el archivo');
    setSubiendo(true);
    try {
      await subirArchivo(instalacionId, archivo, { ...f, nombre: f.nombre || archivo.name });
      listo();
    } catch (err) {
      setError((err as Error).message);
      setSubiendo(false);
    }
  };
  return (
    <Modal titulo="Subir documento" cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <label className="archivo">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => {
            const a = e.target.files?.[0] ?? null;
            setArchivo(a);
            if (a && !f.nombre) setF({ ...f, nombre: a.name.replace(/\.[^.]+$/, '') });
          }} />
          <span>{archivo ? archivo.name : 'Elegir archivo (PDF, imagen u Office, hasta 20 MB)'}</span>
        </label>
        <Campo etiqueta="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Selector etiqueta="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          {Object.entries(TIPOS_DOCUMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <label className="check"><input type="checkbox" checked={f.visible_cliente} onChange={(e) => setF({ ...f, visible_cliente: e.target.checked })} /> <span>Visible para el cliente en su portal</span></label>
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton secundario chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir documento'}</button>
        </div>
      </form>
    </Modal>
  );
}
