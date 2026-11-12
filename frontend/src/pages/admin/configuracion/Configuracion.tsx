// T-33 · Mockups 098 a 103: configuración. General (contacto y reglas de cobro), planes, técnicos
// (con acceso a su panel), condiciones del servicio y correos enviados.
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Mail, Plus, Send, Settings } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Modal, Pestanas, Selector, Titulo, Vacio } from '../../../componentes';
import { fechaCorta, fechaHora, formatearRut, pesos } from '../../../formato';

type Vista = 'general' | 'planes' | 'tecnicos' | 'condiciones' | 'correos';

export default function Configuracion() {
  const [params, setParams] = useSearchParams();
  const vista = (params.get('vista') as Vista) || 'general';
  return (
    <>
      <Titulo icono={Settings} fuerte="Configuración" />
      <Pestanas<Vista> valor={vista} cambiar={(v) => setParams(v === 'general' ? {} : { vista: v }, { replace: true })} opciones={[
        ['general', 'General'], ['planes', 'Planes'], ['tecnicos', 'Técnicos'], ['condiciones', 'Condiciones del servicio'], ['correos', 'Correos'],
      ]} />
      {vista === 'general' && <General />}
      {vista === 'planes' && <Planes />}
      {vista === 'tecnicos' && <Tecnicos />}
      {vista === 'condiciones' && <Condiciones />}
      {vista === 'correos' && <Correos />}
    </>
  );
}

// ---------- General ----------
interface DatosGeneral { whatsapp: string; telefono_contacto: string; email_admin: string; dias_plazo_pago: string; reintentos_cobro: string; correos_automaticos: boolean; cobros_automaticos: boolean }
function General() {
  const { datos } = useDatos<DatosGeneral>('/admin/configuracion/general');
  const [f, setF] = useState<DatosGeneral | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (datos) setF(datos); }, [datos]);
  if (!f) return <Cargando />;
  const c = (k: keyof DatosGeneral) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setAviso('');
    try { await api('/admin/configuracion/general', { method: 'PUT', body: f }); setAviso('Cambios guardados'); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <form className="tarjeta angosta-2 formulario" onSubmit={guardar} noValidate>
      <h2>Contacto de ENINTI</h2>
      <div className="formulario dos">
        <Campo etiqueta="WhatsApp" type="tel" placeholder="+56 9 1234 5678" value={f.whatsapp} onChange={c('whatsapp')} ayuda="Lo usan los botones de WhatsApp del portal" />
        <Campo etiqueta="Teléfono" type="tel" placeholder="+56 55 212 3456" value={f.telefono_contacto} onChange={c('telefono_contacto')} />
        <div className="completo"><Campo etiqueta="Correo que recibe los avisos" type="email" value={f.email_admin} onChange={c('email_admin')} /></div>
      </div>
      <h2>Cobro</h2>
      <div className="formulario dos">
        <Campo etiqueta="Días para pagar" type="number" min="1" max="30" value={f.dias_plazo_pago} onChange={c('dias_plazo_pago')} ayuda="Después, la suscripción se cierra sola" />
        <Campo etiqueta="Intentos de cobro con tarjeta" type="number" min="1" max="5" value={f.reintentos_cobro} onChange={c('reintentos_cobro')} ayuda="Uno por día" />
      </div>
      <div className="chips">
        <Etiqueta tono={f.cobros_automaticos ? 'buena' : 'neutra'}>Cobro automático {f.cobros_automaticos ? 'activo' : 'apagado'}</Etiqueta>
        <Etiqueta tono={f.correos_automaticos ? 'buena' : 'neutra'}>Correos automáticos {f.correos_automaticos ? 'activos' : 'apagados'}</Etiqueta>
      </div>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{aviso}</Aviso>
      <button className="boton primario">Guardar</button>
    </form>
  );
}

// ---------- Planes ----------
interface Plan { id: number; nombre: string; descripcion: string | null; frecuencia_pago: string; monto_clp: number; duracion_meses: number; mantenciones_por_anio: number; incluye_reposicion_equipos: boolean; tiempo_respuesta_horas: number | null; activo: boolean; vigentes: number }
const COBRO: Record<string, string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const PLAN_VACIO = { nombre: '', descripcion: '', frecuencia_pago: 'mensual', monto_clp: '', duracion_meses: '12', mantenciones_por_anio: '2', incluye_reposicion_equipos: false, tiempo_respuesta_horas: '' };
function Planes() {
  const [version, setVersion] = useState(0);
  const { datos, error } = useDatos<Plan[]>(`/admin/configuracion/planes?v=${version}`);
  const [editar, setEditar] = useState<Plan | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState('');
  const listo = (m: string) => { setEditar(null); setAviso(m); setVersion((v) => v + 1); };
  const activar = async (p: Plan) => {
    try { await api(`/admin/configuracion/planes/${p.id}/activo`, { method: 'POST', body: { activo: !p.activo } }); listo(p.activo ? 'Plan desactivado: ya no se puede contratar' : 'Plan activado'); }
    catch (e) { window.alert((e as Error).message); }
  };
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <div className="encabezado"><span className="suave">Los cambios valen para los planes nuevos; los clientes actuales mantienen su precio.</span>
        <button type="button" className="boton primario chico" onClick={() => setEditar('nuevo')}><Plus size={18} /> Nuevo plan</button></div>
      <Aviso tipo="ok">{aviso}</Aviso>
      <div className="tabla"><table>
        <thead><tr><th>Plan</th><th>Cobro</th><th className="num">Monto</th><th>Duración</th><th>Mantenciones</th><th>Clientes</th><th>Estado</th><th /></tr></thead>
        <tbody>{datos.map((p) => (
          <tr key={p.id} className={p.activo ? '' : 'retirado'}>
            <td><strong>{p.nombre}</strong></td>
            <td className="sin-corte">{COBRO[p.frecuencia_pago]}</td>
            <td className="num">{pesos(p.monto_clp)}</td>
            <td className="sin-corte">{p.duracion_meses} meses</td>
            <td className="sin-corte">{p.mantenciones_por_anio} al año</td>
            <td>{p.vigentes}</td>
            <td><Etiqueta tono={p.activo ? 'buena' : 'neutra'}>{p.activo ? 'Activo' : 'Inactivo'}</Etiqueta></td>
            <td><div className="acciones sin-corte">
              <button type="button" className="boton secundario mini" onClick={() => setEditar(p)}>Editar</button>
              <button type="button" className="boton suave mini" onClick={() => activar(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
      {editar && <EditarPlan plan={editar === 'nuevo' ? null : editar} cerrar={() => setEditar(null)} listo={listo} />}
    </>
  );
}
function EditarPlan({ plan, cerrar, listo }: { plan: Plan | null; cerrar: () => void; listo: (m: string) => void }) {
  const [f, setF] = useState(plan ? { ...plan, descripcion: plan.descripcion ?? '', monto_clp: String(plan.monto_clp), duracion_meses: String(plan.duracion_meses), mantenciones_por_anio: String(plan.mantenciones_por_anio), tiempo_respuesta_horas: plan.tiempo_respuesta_horas ? String(plan.tiempo_respuesta_horas) : '' } : PLAN_VACIO);
  const [error, setError] = useState('');
  const c = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(plan ? `/admin/configuracion/planes/${plan.id}` : '/admin/configuracion/planes', { method: plan ? 'PUT' : 'POST', body: f });
      listo(plan ? 'Plan actualizado' : 'Plan creado: ya aparece en el portal para contratar');
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal titulo={plan ? `Editar ${plan.nombre}` : 'Nuevo plan'} cerrar={cerrar} ancho={640}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <div className="completo"><Campo etiqueta="Nombre" placeholder="Plan Plus" value={f.nombre} onChange={c('nombre')} /></div>
        <Campo etiqueta="Monto" type="number" min="0" value={f.monto_clp} onChange={c('monto_clp')} />
        <Selector etiqueta="Se cobra" value={f.frecuencia_pago} onChange={c('frecuencia_pago')}>
          {Object.entries(COBRO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Mantenciones al año" type="number" min="0" max="12" value={f.mantenciones_por_anio} onChange={c('mantenciones_por_anio')} />
        <Campo etiqueta="Duración (meses)" type="number" min="1" max="60" value={f.duracion_meses} onChange={c('duracion_meses')} />
        <Campo etiqueta="Respuesta a emergencias (horas, opcional)" type="number" min="1" value={f.tiempo_respuesta_horas} onChange={c('tiempo_respuesta_horas')} />
        <label className="check centrar-vertical"><input type="checkbox" checked={f.incluye_reposicion_equipos} onChange={(e) => setF({ ...f, incluye_reposicion_equipos: e.target.checked })} /> <span>Incluye reposición de equipos</span></label>
        <div className="completo"><AreaTexto etiqueta="Descripción para el cliente (opcional)" value={f.descripcion} onChange={c('descripcion')} /></div>
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico">{plan ? 'Guardar' : 'Crear plan'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Técnicos ----------
interface Tecnico { id: number; nombre: string; rut: string | null; empresa: string | null; telefono: string | null; email: string | null; activo: boolean; pendientes: number; realizadas: number; calificacion: string | null; acceso: 'sin_cuenta' | 'invitado' | 'activo' | 'sin_correo' }
const ACCESO: Record<Tecnico['acceso'], [('buena' | 'alerta' | 'neutra'), string]> = { activo: ['buena', 'Usa el panel'], invitado: ['alerta', 'Invitado'], sin_cuenta: ['neutra', 'Sin acceso'], sin_correo: ['neutra', 'Sin correo'] };
function Tecnicos() {
  const [version, setVersion] = useState(0);
  const { datos, error } = useDatos<Tecnico[]>(`/admin/configuracion/tecnicos?v=${version}`);
  const [editar, setEditar] = useState<Tecnico | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState('');
  const listo = (m: string) => { setEditar(null); setAviso(m); setVersion((v) => v + 1); };
  const accion = async (ruta: string, body: object | undefined, mensaje: (r: { correo?: string }) => string) => {
    try { const r = await api<{ correo?: string }>(ruta, { method: 'POST', body }); listo(mensaje(r)); } catch (e) { window.alert((e as Error).message); }
  };
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <div className="encabezado"><span className="suave">Aparecen en el calendario para asignarles visitas.</span>
        <button type="button" className="boton primario chico" onClick={() => setEditar('nuevo')}><Plus size={18} /> Nuevo técnico</button></div>
      <Aviso tipo="ok">{aviso}</Aviso>
      {datos.length === 0 ? <Vacio>Aún no hay técnicos.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Técnico</th><th>RUT</th><th>Teléfono</th><th>Correo</th><th>Visitas</th><th>Panel</th><th /></tr></thead>
          <tbody>{datos.map((t) => (
            <tr key={t.id} className={t.activo ? '' : 'retirado'}>
              <td><strong>{t.nombre}</strong><small>{t.empresa ?? 'ENINTI'}{!t.activo ? ' · desactivado' : ''}</small></td>
              <td className="sin-corte">{t.rut ?? '—'}</td>
              <td className="sin-corte">{t.telefono ?? '—'}</td>
              <td>{t.email ?? '—'}</td>
              <td>{t.pendientes} pendientes<small>{t.realizadas} realizadas{t.calificacion ? ` · ★ ${t.calificacion}` : ''}</small></td>
              <td><Etiqueta tono={ACCESO[t.acceso][0]}>{ACCESO[t.acceso][1]}</Etiqueta></td>
              <td><div className="acciones sin-corte">
                {t.activo && t.email && t.acceso !== 'activo' && (
                  <button type="button" className="boton primario mini" onClick={() => accion(`/admin/configuracion/tecnicos/${t.id}/acceso`, undefined, (r) => `Acceso enviado a ${r.correo}`)}><Send size={14} /> {t.acceso === 'invitado' ? 'Reenviar acceso' : 'Enviar acceso'}</button>
                )}
                <button type="button" className="boton secundario mini" onClick={() => setEditar(t)}>Editar</button>
                <button type="button" className="boton suave mini" onClick={() => accion(`/admin/configuracion/tecnicos/${t.id}/activo`, { activo: !t.activo }, () => (t.activo ? 'Técnico desactivado: ya no entra a su panel' : 'Técnico activado'))}>{t.activo ? 'Desactivar' : 'Activar'}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {editar && <EditarTecnico t={editar === 'nuevo' ? null : editar} cerrar={() => setEditar(null)} listo={listo} />}
    </>
  );
}
function EditarTecnico({ t, cerrar, listo }: { t: Tecnico | null; cerrar: () => void; listo: (m: string) => void }) {
  const [f, setF] = useState({ nombre: t?.nombre ?? '', rut: t?.rut ?? '', empresa: t?.empresa ?? 'ENINTI', telefono: t?.telefono ?? '', email: t?.email ?? '' });
  const [error, setError] = useState('');
  const c = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(t ? `/admin/configuracion/tecnicos/${t.id}` : '/admin/configuracion/tecnicos', { method: t ? 'PUT' : 'POST', body: f }); listo(t ? 'Técnico actualizado' : 'Técnico agregado. Envíale el acceso a su panel.'); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <Modal titulo={t ? `Editar ${t.nombre}` : 'Nuevo técnico'} cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <Campo etiqueta="Nombre" value={f.nombre} onChange={c('nombre')} />
        <Campo etiqueta="RUT" value={f.rut} onChange={c('rut')} onBlur={() => setF({ ...f, rut: formatearRut(f.rut) })} placeholder="12.345.678-K" />
        <Campo etiqueta="Empresa" value={f.empresa} onChange={c('empresa')} ayuda="ENINTI o la empresa externa" />
        <Campo etiqueta="Teléfono" type="tel" value={f.telefono} onChange={c('telefono')} />
        <Campo etiqueta="Correo" type="email" value={f.email} onChange={c('email')} ayuda="Para enviarle el acceso a su panel" />
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico">{t ? 'Guardar' : 'Agregar'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Condiciones del servicio ----------
interface Version { id: number; version: string; vigente_desde: string; vigente_hasta: string | null; url: string | null; aceptadas: number }
function Condiciones() {
  const [version, setVersion] = useState(0);
  const { datos, error } = useDatos<Version[]>(`/admin/configuracion/condiciones?v=${version}`);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState('');
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <div className="encabezado"><span className="suave">Los clientes aceptan la versión vigente al contratar.</span>
        <button type="button" className="boton primario chico" onClick={() => setNueva(true)}><Plus size={18} /> Nueva versión</button></div>
      <Aviso tipo="ok">{aviso}</Aviso>
      <div className="tabla"><table>
        <thead><tr><th>Versión</th><th>Vigencia</th><th>Aceptada por</th><th>Documento</th></tr></thead>
        <tbody>{datos.map((v) => (
          <tr key={v.id}>
            <td><strong>{v.version}</strong> {!v.vigente_hasta && <Etiqueta tono="buena">Vigente</Etiqueta>}</td>
            <td>Desde {fechaCorta(v.vigente_desde)}{v.vigente_hasta && <small>hasta {fechaCorta(v.vigente_hasta)}</small>}</td>
            <td>{v.aceptadas} {v.aceptadas === 1 ? 'suscripción' : 'suscripciones'}</td>
            <td>{v.url ? <a href={v.url} target="_blank" rel="noreferrer"><FileText size={14} /> Ver PDF</a> : <span className="suave">Sin PDF</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {nueva && <NuevaVersion cerrar={() => setNueva(false)} listo={() => { setNueva(false); setAviso('Nueva versión publicada: desde hoy los clientes aceptan esta.'); setVersion((x) => x + 1); }} />}
    </>
  );
}
function NuevaVersion({ cerrar, listo }: { cerrar: () => void; listo: () => void }) {
  const [version, setVersion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!version.trim()) return setError('Escribe la versión, por ejemplo v2');
    if (!archivo) return setError('Elige el PDF');
    if (archivo.type !== 'application/pdf') return setError('El archivo debe ser PDF');
    setEnviando(true);
    try {
      const { ruta, url } = await api<{ ruta: string; url: string }>('/admin/configuracion/condiciones/subida', { method: 'POST', body: { version } });
      const cuerpo = new FormData(); cuerpo.append('cacheControl', '3600'); cuerpo.append('', archivo);
      const r = await fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: cuerpo });
      if (!r.ok) throw new Error('No se pudo subir el PDF');
      await api('/admin/configuracion/condiciones', { method: 'POST', body: { version: version.trim(), archivo_path: ruta } });
      listo();
    } catch (err) { setError((err as Error).message); setEnviando(false); }
  };
  return (
    <Modal titulo="Nueva versión de las condiciones" cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <Campo etiqueta="Versión" placeholder="v2" value={version} onChange={(e) => setVersion(e.target.value)} />
        <label className="archivo"><input type="file" accept="application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /><span>{archivo ? archivo.name : 'Elegir PDF'}</span></label>
        <p className="suave">Las suscripciones actuales conservan la versión que aceptaron.</p>
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton primario chico" disabled={enviando}>{enviando ? 'Publicando…' : 'Publicar'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Correos ----------
interface Correo { id: number; tipo_evento: string; asunto: string; destinatario: string; para: string | null; estado: string; ultimo_error: string | null; fecha_generacion: string; enviada_at: string | null; cliente: string | null }
interface Ejemplo { evento: string; rol: string; dias: number | null; para: string; cuando: string; asunto: string; html: string }
const DIA_AVISO = (n: number) => (n === 0 ? 'El mismo día' : n === 1 ? '1 día antes' : `${n} días antes`);
const ESTADO_CORREO: Record<string, ['buena' | 'alerta' | 'mala' | 'neutra', string]> = { enviada: ['buena', 'Enviado'], pendiente: ['alerta', 'En cola'], error: ['mala', 'Con error'], descartada: ['neutra', 'Descartado'] };
const PARA: Record<string, string> = { cliente: 'Cliente', admin: 'Administrador', tecnico: 'Técnico' };
function Correos() {
  const { datos, error } = useDatos<{ correos: Correo[]; automaticos: boolean }>('/admin/configuracion/correos');
  const { datos: ej } = useDatos<Ejemplo[]>('/admin/configuracion/correos/ejemplos');
  const [ver, setVer] = useState<Ejemplo | null>(null);
  const [para, setPara] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [falla, setFalla] = useState('');
  const [dias, setDias] = useState(3);
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  // Envía solo el correo que se está viendo
  const enviar = async (e: Ejemplo) => {
    setFalla(''); setAviso(''); setEnviando(true);
    try { await api('/admin/configuracion/correos/ejemplos', { method: 'POST', body: { para, evento: e.evento, rol: e.rol, dias: e.dias } }); setAviso(`Enviado a ${para}: "${e.asunto}" (para ${e.para.toLowerCase()}).`); return true; }
    catch (err) { setFalla((err as Error).message); return false; } finally { setEnviando(false); }
  };
  // Agrupa los ejemplos por evento: cuándo se envía y a quién
  // (el de vencimiento muestra el día elegido)
  const eventos = ej ? [...new Set(ej.map((e) => e.evento))].map((ev) => ej.filter((e) => e.evento === ev && (e.dias === null || e.dias === dias))) : [];
  const diasAviso = ej ? [...new Set(ej.filter((e) => e.dias !== null).map((e) => e.dias as number))] : [];
  return (
    <>
      <p className="nota-info"><span>Correos automáticos: <strong>{datos.automaticos ? 'activos' : 'apagados'}</strong>. Syntia manda un correo por cada cosa que pasa, una sola vez. Los de cuenta (invitación y contraseña) se envían siempre.</span></p>
      <section className="tarjeta">
        <header className="tarjeta-cabecera"><h2>Qué correos se envían</h2></header>
        <div className="tabla"><table>
          <thead><tr><th>Cuándo</th><th>Le llega a (toca para ver el correo)</th></tr></thead>
          <tbody>{eventos.map((grupo) => (
            <tr key={grupo[0].evento}>
              <td><strong>{grupo[0].cuando}</strong>
                {grupo[0].dias !== null && (
                  <div className="campo-dias">
                    <label htmlFor="dias-aviso">Ver el aviso de</label>
                    <select id="dias-aviso" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                      {diasAviso.map((n) => <option key={n} value={n}>{DIA_AVISO(n)}</option>)}
                    </select>
                  </div>
                )}</td>
              <td><div className="acciones">{grupo.map((e) => <button key={e.rol} type="button" className="boton secundario mini" onClick={() => { setFalla(''); setVer(e); }}><Mail size={14} /> {e.para}</button>)}</div></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="enviar-ejemplos">
          <Campo etiqueta="Correo para enviar ejemplos" type="email" placeholder="profesor@correo.cl" value={para} onChange={(e) => setPara(e.target.value)}
            ayuda="Abre un correo de la lista y envíalo: llega solo ese, uno por uno." />
        </div>
        <Aviso tipo="ok">{aviso}</Aviso>
      </section>

      <h2 className="subtitulo">Enviados</h2>
      {datos.correos.length === 0 ? <Vacio>Aún no se han enviado correos automáticos.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Estado</th></tr></thead>
          <tbody>{datos.correos.map((c) => (
            <tr key={c.id}>
              <td>{c.enviada_at ? fechaHora(c.enviada_at) : fechaCorta(c.fecha_generacion)}</td>
              <td>{c.para ? PARA[c.para] ?? c.para : c.cliente ?? 'Cliente'}<small>{c.destinatario}</small></td>
              <td>{c.asunto}</td>
              <td><Etiqueta tono={(ESTADO_CORREO[c.estado] ?? ['neutra', c.estado])[0]}>{(ESTADO_CORREO[c.estado] ?? ['neutra', c.estado])[1]}</Etiqueta>{c.ultimo_error && <small>{c.ultimo_error}</small>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {ver && (
        <Modal titulo={`${ver.asunto} · para ${ver.para.toLowerCase()}`} cerrar={() => setVer(null)} ancho={640}>
          <iframe title="Vista previa del correo" className="vista-correo" srcDoc={ver.html} />
          <Aviso>{falla}</Aviso>
          <div className="botones">
            <button type="button" className="boton suave chico" onClick={() => setVer(null)}>Cerrar</button>
            <button type="button" className="boton primario chico" disabled={enviando || !para.includes('@')} onClick={() => enviar(ver).then((ok) => ok && setVer(null))}>
              <Send size={16} /> {enviando ? 'Enviando…' : para.includes('@') ? `Enviar este correo a ${para}` : 'Escribe arriba el correo de destino'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
