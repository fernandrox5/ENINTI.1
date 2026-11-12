// T-22 · Mockups 048 a 054: ficha del cliente con sus pestañas
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, Plus, Send } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Pestanas, Vacio, Volver } from '../../../componentes';
import { fecha, fechaCorta, iniciales, mes, pesos, MEDIOS, SISTEMAS } from '../../../formato';
import { ESTADO_PAGO, ESTADO_SOLICITUD, TIPO_SOLICITUD, CANALES, situacionInstalacion } from '../../../estados';
import ClienteFormulario from './ClienteFormulario';
import RegistrarGestion from './RegistrarGestion';
import { GESTIONES, PORTAL, type Portal } from './Clientes';

interface Ficha {
  id: number; nombre: string; rut: string | null; es_empresa: boolean; email: string | null; telefono: string | null;
  direccion: string | null; localidad_id: number | null; localidad: string | null; origen: string | null; notas: string | null;
  activo: boolean; created_at: string; perfil_id: string | null; correo_acceso: string | null; ultimo_ingreso: string | null;
  acceso_activado: string | null; invitado_en: string | null;
  resumen: { deuda: number; total_pagado: number; ultimo_pago: { fecha_pago: string | null; created_at: string; monto: number; estado: string } | null };
  instalaciones: { id: number; codigo: string; nombre: string | null; direccion: string; tipo_sistema: string | null; potencia_kwp: string | null; localidad: string | null; suscripcion_id: number | null; dias_restantes: number | null; periodos_adeudados: number | null; pagos_por_validar: number | null }[];
  suscripciones: { id: number; codigo: string; estado: string; instalacion_nombre: string | null; instalacion_codigo: string; tipo_nombre: string; fecha_inicio: string; fecha_termino: string; fecha_cierre: string | null; motivo_cierre: string | null; dias_restantes: number; periodos_adeudados: number; monto_adeudado: number }[];
  pagos: { id: number; periodo: string; monto: number; medio_pago: string; estado: string; fecha_pago: string | null; instalacion: string | null; instalacion_codigo: string }[];
  solicitudes: { id: number; tipo: string; estado: string; canal: string; descripcion: string; created_at: string; instalacion: string | null }[];
  gestiones: { id: number; tipo: string; motivo: string; resultado: string | null; fecha: string; realizada_por: string | null }[];
}
type Pestana = 'resumen' | 'instalaciones' | 'pagos' | 'solicitudes' | 'gestiones';

export default function ClienteFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { datos: c, error, cargando, recargar } = useDatos<Ficha>(`/admin/clientes/${id}`);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [editando, setEditando] = useState(false);
  const [gestion, setGestion] = useState(false);
  const [aviso, setAviso] = useState('');
  const [invitando, setInvitando] = useState(false);

  if (cargando && !c) return <Cargando />;
  if (!c) return <><Volver a="/admin/clientes" texto="Clientes" /><Aviso>{error || 'Cliente no encontrado'}</Aviso></>;

  const cambiarActivo = async () => {
    const accion = c.activo ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Seguro que quieres ${accion} a ${c.nombre}? ${c.activo ? 'Sus datos y suscripciones se conservan.' : ''}`)) return;
    await api(`/admin/clientes/${c.id}/activo`, { method: 'POST', body: { activo: !c.activo } });
    setAviso(c.activo ? 'Cliente desactivado' : 'Cliente reactivado');
    recargar();
  };

  const portal: Portal = !c.perfil_id ? 'sin_acceso' : c.acceso_activado ? 'activo' : 'invitado';
  const mensajeWhatsapp = `Hola ${c.nombre.split(' ')[0]}: ENINTI te dio acceso a Syntia, donde verás tus instalaciones, pagos y mantenciones. `
    + `Te enviamos un correo a ${c.email} con el enlace para activar tu cuenta. Si no te llegó, pídelo en ${window.location.origin}/acceso con ese mismo correo.`;

  const invitar = async () => {
    setInvitando(true);
    setAviso('');
    try {
      const r = await api<{ correo: string }>(`/admin/clientes/${c.id}/invitar`, { method: 'POST' });
      setAviso(`Invitación enviada a ${r.correo}`);
      recargar();
    } catch (e) {
      setAviso('');
      window.alert((e as Error).message);
    } finally {
      setInvitando(false);
    }
  };

  return (
    <>
      <Volver a="/admin/clientes" texto="Clientes" />
      <div className="ficha-cabecera">
        <span className="avatar grande">{iniciales(c.nombre)}</span>
        <div className="ficha-titulo">
          <h1>{c.nombre}</h1>
          <p>
            {[c.localidad, `cliente desde ${mes(c.created_at).split(' ')[0].slice(0, 3)} ${c.created_at.slice(0, 4)}`].filter(Boolean).join(' · ')}
            {' '}{c.resumen.deuda > 0 && <Etiqueta tono="mala" punto>Pago pendiente</Etiqueta>}
            {' '}<Etiqueta tono={PORTAL[portal][0]}>{portal === 'activo' ? 'Cuenta activa' : portal === 'invitado' ? 'Invitación enviada' : 'Sin cuenta'}</Etiqueta>
            {' '}{!c.activo && <Etiqueta tono="mala">Inactivo</Etiqueta>}
          </p>
        </div>
        <div className="acciones">
          <button type="button" className="boton suave chico" onClick={() => setEditando(true)}>Editar datos</button>
          <button type="button" className="boton primario chico" onClick={() => setGestion(true)}>Anotar contacto</button>
        </div>
      </div>
      <Aviso tipo="ok">{aviso}</Aviso>

      <Pestanas<Pestana> valor={pestana} cambiar={setPestana} opciones={[
        ['resumen', 'Resumen'], ['instalaciones', 'Instalaciones', c.instalaciones.length], ['pagos', 'Pagos'],
        ['solicitudes', 'Solicitudes', c.solicitudes.length], ['gestiones', 'Contactos', c.gestiones.length],
      ]} />

      {pestana === 'resumen' && (
        <div className="resumen-instalacion">
          <section className="tarjeta">
            <h2>Datos de contacto</h2>
            <div className="mosaico-datos">
              <div><span>Teléfono</span><strong>{c.telefono ? <a href={`tel:${c.telefono}`}>{c.telefono}</a> : '—'}</strong></div>
              <div><span>RUT</span><strong>{c.rut || '—'}</strong></div>
              <div className="ancho"><span>Correo</span><strong>{c.email || '—'}</strong></div>
              <div className="ancho"><span>Dirección</span><strong>{c.direccion ? (c.localidad && !c.direccion.includes(c.localidad) ? `${c.direccion}, ${c.localidad}` : c.direccion) : c.localidad || '—'}</strong></div>
              <div><span>Tipo</span><strong>{c.es_empresa ? 'Empresa' : 'Persona'}</strong></div>
              <div><span>¿Cómo llegó?</span><strong>{c.origen || '—'}</strong></div>
            </div>
            {c.notas && <p className="nota-instalacion"><strong>Notas:</strong> {c.notas}</p>}
          </section>

          <section className="tarjeta">
            <h2>Cuenta en el portal</h2>
            <div className="suscripcion-resumen"><Etiqueta tono={PORTAL[portal][0]} punto>{portal === 'activo' ? 'Activa' : portal === 'invitado' ? 'Invitación enviada' : 'Sin cuenta'}</Etiqueta></div>
            <dl className="datos lineas">
              <div><dt>Correo de acceso</dt><dd>{c.correo_acceso || c.email || '—'}</dd></div>
              {c.invitado_en && portal !== 'activo' && <div><dt>Invitación enviada</dt><dd>{fechaCorta(c.invitado_en)}</dd></div>}
              <div><dt>Último ingreso</dt><dd>{c.ultimo_ingreso ? fechaCorta(c.ultimo_ingreso) : 'Nunca'}</dd></div>
            </dl>
            {portal !== 'activo' && (
              <>
                <p className="suave">{!c.email ? 'Agrega su correo (Editar datos) para enviarle la invitación.'
                  : portal === 'invitado' ? 'Aún no activa su cuenta. Puedes reenviarle la invitación.'
                  : 'Envíale la invitación: le llega un correo para crear su contraseña.'}</p>
                <div className="acciones">
                  <button type="button" className="boton primario chico" disabled={!c.email || invitando} onClick={invitar}>
                    <Send size={16} /> {invitando ? 'Enviando…' : portal === 'invitado' ? 'Reenviar invitación' : 'Enviar invitación'}
                  </button>
                  {c.email && (
                    <button type="button" className="boton suave chico" onClick={() => navigator.clipboard.writeText(mensajeWhatsapp).then(() => setAviso('Mensaje copiado para WhatsApp'))}>
                      <Copy size={16} /> Copiar aviso para WhatsApp
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
          <button type="button" className="enlace-peligro" onClick={cambiarActivo}>{c.activo ? 'Desactivar cliente' : 'Reactivar cliente'}</button>
        </div>
      )}

      {pestana === 'instalaciones' && (
        <>
          <div className="encabezado"><span className="suave">{c.instalaciones.length} {c.instalaciones.length === 1 ? 'instalación' : 'instalaciones'}</span>
            <Link to={`/admin/instalaciones/nueva?cliente=${c.id}`} className="boton primario mini"><Plus size={16} /> Agregar instalación</Link></div>
          {c.instalaciones.length === 0 ? <Vacio>Este cliente aún no tiene instalaciones.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Instalación</th><th>Localidad</th><th className="num">Potencia</th><th>Suscripción</th><th /></tr></thead>
              <tbody>{c.instalaciones.map((i) => {
                const [tono, texto] = situacionInstalacion(i);
                return (
                  <tr key={i.id} className="clic" onClick={() => navegar(`/admin/instalaciones/${i.id}`)}>
                    <td><strong>{i.nombre || i.direccion}</strong><small>{i.tipo_sistema ? SISTEMAS[i.tipo_sistema] : i.direccion}</small></td>
                    <td>{i.localidad || '—'}</td>
                    <td className="num">{i.potencia_kwp ? `${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : '—'}</td>
                    <td><Etiqueta tono={tono} punto={tono !== 'neutra'}>{texto}</Etiqueta></td>
                    <td><span className="boton secundario mini">Ver</span></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </>
      )}

      {pestana === 'pagos' && (
        <>
          <div className="encabezado"><span className="suave">Los pagos con tarjeta o por el portal se registran solos.</span>
            <Link to={`/admin/pagos/registrar?cliente=${c.id}`} className="boton secundario mini"><Plus size={16} /> Registrar pago en efectivo</Link></div>
          <div className="kpis tres">
            <div className="kpi"><span className="kpi-titulo">Total pagado</span><strong className="kpi-valor">{pesos(c.resumen.total_pagado)}</strong></div>
            <div className="kpi"><span className="kpi-titulo">Último pago</span>
              <strong className="kpi-valor">{c.resumen.ultimo_pago ? fechaCorta(c.resumen.ultimo_pago.fecha_pago ?? c.resumen.ultimo_pago.created_at).replace(/ \d{4}$/, '') : '—'}</strong>
              {c.resumen.ultimo_pago && <span className="suave">{pesos(c.resumen.ultimo_pago.monto)} · {ESTADO_PAGO[c.resumen.ultimo_pago.estado][1].toLowerCase()}</span>}</div>
            <div className={`kpi ${c.resumen.deuda > 0 ? 'mala' : ''}`}><span className="kpi-titulo">Pago pendiente</span><strong className="kpi-valor">{c.resumen.deuda > 0 ? pesos(c.resumen.deuda) : 'No'}</strong>{c.resumen.deuda > 0 && <span className="suave">Se cobra solo; si no paga en el plazo, la suscripción se cierra</span>}</div>
          </div>
          {c.pagos.length === 0 ? <Vacio>Sin pagos registrados.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Periodo</th><th>Instalación</th><th className="num">Monto</th><th>Medio</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>{c.pagos.map((p) => (
                <tr key={p.id}>
                  <td>{mes(p.periodo).replace(/^./, (l) => l.toUpperCase())}</td>
                  <td>{p.instalacion || p.instalacion_codigo}</td>
                  <td className="num">{pesos(p.monto)}</td>
                  <td>{MEDIOS[p.medio_pago]}</td>
                  <td>{fecha(p.fecha_pago)}</td>
                  <td><Etiqueta tono={ESTADO_PAGO[p.estado][0]}>{ESTADO_PAGO[p.estado][1]}</Etiqueta></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}

      {pestana === 'solicitudes' && (c.solicitudes.length === 0 ? <Vacio>Sin solicitudes.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Tipo</th><th>Instalación</th><th>Fecha</th><th>Canal</th><th>Estado</th></tr></thead>
          <tbody>{c.solicitudes.map((s) => (
            <tr key={s.id} className="clic" onClick={() => navegar(`/admin/solicitudes?id=${s.id}`)}>
              <td>{s.tipo === 'emergencia' ? <Etiqueta tono="mala">Emergencia</Etiqueta> : TIPO_SOLICITUD[s.tipo]}<small>{s.descripcion}</small></td>
              <td>{s.instalacion || '—'}</td>
              <td>{fechaCorta(s.created_at)}</td>
              <td>{CANALES[s.canal]}</td>
              <td><Etiqueta tono={ESTADO_SOLICITUD[s.estado][0]}>{ESTADO_SOLICITUD[s.estado][1]}</Etiqueta></td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}

      {pestana === 'gestiones' && (
        <>
          <div className="encabezado"><span className="suave">Llamadas, mensajes y visitas</span>
            <button type="button" className="boton primario mini" onClick={() => setGestion(true)}><Plus size={16} /> Anotar contacto</button></div>
          {c.gestiones.length === 0 ? <Vacio>Aún no hay contactos anotados con este cliente.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Resultado</th><th>Por</th></tr></thead>
              <tbody>{c.gestiones.map((g) => (
                <tr key={g.id}>
                  <td>{fechaCorta(g.fecha)}</td><td>{GESTIONES[g.tipo]}</td><td>{g.motivo}</td><td>{g.resultado || '—'}</td><td>{g.realizada_por || '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}

      {editando && (
        <ClienteFormulario id={c.id} cerrar={() => setEditando(false)} listo={() => { setEditando(false); setAviso('Cambios guardados'); recargar(); }}
          inicial={{
            rut: c.rut ?? '', nombre: c.nombre, es_empresa: c.es_empresa, email: c.email ?? '', telefono: c.telefono ?? '',
            direccion: c.direccion ?? '', localidad_id: c.localidad_id ? String(c.localidad_id) : '', origen: c.origen ?? '', notas: c.notas ?? '',
          }} />
      )}
      {gestion && <RegistrarGestion clienteId={c.id} clienteNombre={c.nombre} cerrar={() => setGestion(false)}
        listo={() => { setGestion(false); setPestana('gestiones'); setAviso('Contacto anotado'); recargar(); }} />}
    </>
  );
}
