// T-30 · Mockups 092 a 096: seguimiento para retener y recuperar clientes. Pagos pendientes (el mes
// en curso sin pagar, con los días de plazo que quedan), por vencer, instalaciones a recuperar y el
// historial de gestiones. Cada fila permite escribir por WhatsApp y registrar la gestión.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, MessageCircle, Search } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Etiqueta, Pestanas, Titulo, Vacio } from '../../../componentes';
import { fechaCorta, mes, pesos } from '../../../formato';
import { GESTIONES } from '../clientes/Clientes';
import RegistrarGestion from '../clientes/RegistrarGestion';
import { Quedan } from '../suscripciones/Suscripciones';

type Vista = 'pendientes' | 'vencer' | 'recuperar' | 'gestiones';
interface UltimaGestion { tipo: string; fecha: string; motivo: string }
interface Pendiente {
  suscripcion_id: number; suscripcion: string; monto: number; cliente_id: number; cliente: string; telefono: string | null; instalacion_id: number; instalacion: string;
  periodo: string; desde: string; dias: number; quedan_dias: number; plazo: number; tarjeta: string | null; intentos: number; ultimo_rechazo: string | null;
  enlace_pendiente: boolean; ultima_gestion: UltimaGestion | null;
}
interface Vencer {
  suscripcion_id: number; suscripcion: string; plan: string; fecha_termino: string; dias_restantes: number; cliente_id: number; cliente: string; telefono: string | null;
  instalacion_id: number; instalacion: string; renovada: boolean; con_tarjeta: boolean; ultima_gestion: UltimaGestion | null;
}
interface Recuperar {
  instalacion_id: number; instalacion_codigo: string; instalacion: string; localidad: string | null; cliente_id: number; cliente: string; telefono: string | null;
  situacion: string; cantidad_suscripciones: number; ultima_fecha_fin: string | null; ultimo_motivo_cierre: string | null; dias_sin_cobertura: number | null;
  ultima_gestion: UltimaGestion | null;
}
interface Datos { pagos_pendientes: Pendiente[]; por_vencer: Vencer[]; a_recuperar: Recuperar[]; gestiones_mes: number }
interface Gestion { id: number; tipo: string; motivo: string; resultado: string | null; fecha: string; cliente_id: number; cliente: string; suscripcion_id: number | null; suscripcion: string | null; realizada_por: string | null }
interface Accion { cliente_id: number; cliente: string; suscripcion_id?: number; motivo: string }

// Enlace de WhatsApp al teléfono del cliente con un mensaje ya escrito
export function whatsapp(telefono: string | null, texto: string) {
  const numero = (telefono ?? '').replace(/\D/g, '');
  return numero ? `https://wa.me/${numero.length === 9 ? `56${numero}` : numero}?text=${encodeURIComponent(texto)}` : null;
}
const primerNombre = (n: string) => n.replace(/\[[^\]]*\]\s*/g, '').split(' ')[0];

function BotonWhatsApp({ telefono, texto }: { telefono: string | null; texto: string }) {
  const url = whatsapp(telefono, texto);
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="boton secundario mini"><MessageCircle size={14} /> WhatsApp</a>
    : <span className="suave" title="El cliente no tiene teléfono">Sin teléfono</span>;
}
const Gestionada = ({ g }: { g: UltimaGestion | null }) => (g ? <>{GESTIONES[g.tipo]} · {fechaCorta(g.fecha)}</> : <span className="suave">Sin gestión</span>);

export default function Seguimiento() {
  const [params, setParams] = useSearchParams();
  const vista = (params.get('vista') as Vista) || 'pendientes';
  const [version, setVersion] = useState(0);
  const { datos, error, cargando } = useDatos<Datos>(`/admin/seguimiento?v=${version}`);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState('');
  const cambiar = (v: Vista) => setParams(v === 'pendientes' ? {} : { vista: v }, { replace: true });

  const copiarEnlace = async (p: Pendiente) => {
    try {
      const r = await api<{ url: string }>(`/admin/pagos/suscripcion/${p.suscripcion_id}/enlace`, { method: 'POST', body: { cantidad: 1 } });
      await navigator.clipboard.writeText(r.url);
      setAviso(`Enlace de pago de ${p.cliente} copiado: pégalo en WhatsApp o en un correo.`);
    } catch (e) { setAviso((e as Error).message); }
  };

  return (
    <>
      <div className="encabezado">
        <Titulo fuerte="Seguimiento" />
      </div>
      <Pestanas<Vista> valor={vista} cambiar={cambiar} opciones={[
        ['pendientes', 'Pagos pendientes', datos?.pagos_pendientes.length], ['vencer', 'Por vencer', datos?.por_vencer.length],
        ['recuperar', 'A recuperar', datos?.a_recuperar.length], ['gestiones', 'Gestiones', datos?.gestiones_mes],
      ]} />
      <Aviso tipo="ok">{aviso}</Aviso>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (
        <>
          {vista === 'pendientes' && (
            <>
              <p className="suave">Tienen {datos.pagos_pendientes[0]?.plazo ?? 7} días para pagar. Después, la suscripción se cierra sola.</p>
              {datos.pagos_pendientes.length === 0 ? <Vacio>Nadie tiene pagos pendientes. 🎉</Vacio> : (
                <div className="tabla"><table>
                  <thead><tr><th>Cliente</th><th>Instalación</th><th>Mes</th><th>Quedan</th><th>Cómo paga</th><th>Última gestión</th><th /></tr></thead>
                  <tbody>{datos.pagos_pendientes.map((p) => (
                    <tr key={p.suscripcion_id}>
                      <td><Link to={`/admin/clientes/${p.cliente_id}`}><strong>{p.cliente}</strong></Link><small>{p.suscripcion} · {pesos(p.monto)}</small></td>
                      <td>{p.instalacion}</td>
                      <td>{mes(p.periodo)}<small>desde el {fechaCorta(p.desde)}</small></td>
                      <td><Etiqueta tono={p.quedan_dias <= 2 ? 'mala' : 'alerta'}>{p.quedan_dias === 0 ? 'Último día' : `${p.quedan_dias} ${p.quedan_dias === 1 ? 'día' : 'días'}`}</Etiqueta></td>
                      <td>{p.tarjeta ?? 'Enlace de pago'}{p.ultimo_rechazo ? <small className="texto-malo">{p.intentos} {p.intentos === 1 ? 'intento' : 'intentos'} · {p.ultimo_rechazo}</small> : p.enlace_pendiente ? <small>Enlace enviado</small> : null}</td>
                      <td><Gestionada g={p.ultima_gestion} /></td>
                      <td><div className="acciones sin-corte">
                        <BotonWhatsApp telefono={p.telefono} texto={`Hola ${primerNombre(p.cliente)}, te escribimos de ENINTI. No hemos recibido el pago de ${mes(p.periodo)} de tu suscripción de mantención. Te quedan ${p.quedan_dias} días para pagar y no perder tu plan.`} />
                        <button type="button" className="boton secundario mini" onClick={() => copiarEnlace(p)}><Copy size={14} /> Enlace de pago</button>
                        <button type="button" className="boton suave mini" onClick={() => setAccion({ cliente_id: p.cliente_id, cliente: p.cliente, suscripcion_id: p.suscripcion_id, motivo: `Pago pendiente de ${mes(p.periodo)}` })}>Gestión</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </>
          )}

          {vista === 'vencer' && (datos.por_vencer.length === 0 ? <Vacio>Ninguna suscripción vence en los próximos 30 días.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Cliente</th><th>Instalación</th><th>Plan</th><th>Vence</th><th>Quedan</th><th>Última gestión</th><th /></tr></thead>
              <tbody>{datos.por_vencer.map((v) => (
                <tr key={v.suscripcion_id}>
                  <td><Link to={`/admin/clientes/${v.cliente_id}`}><strong>{v.cliente}</strong></Link><small>{v.suscripcion}</small></td>
                  <td>{v.instalacion}</td>
                  <td>{v.plan}</td>
                  <td>{fechaCorta(v.fecha_termino)}</td>
                  <td><Quedan dias={v.dias_restantes} />{v.renovada && <small>Ya renovada</small>}</td>
                  <td><Gestionada g={v.ultima_gestion} /></td>
                  <td><div className="acciones sin-corte">
                    <BotonWhatsApp telefono={v.telefono} texto={`Hola ${primerNombre(v.cliente)}, te escribimos de ENINTI. Tu plan de mantención de ${v.instalacion} vence el ${fechaCorta(v.fecha_termino)}. ¿Quieres renovarlo?`} />
                    <button type="button" className="boton suave mini" onClick={() => setAccion({ cliente_id: v.cliente_id, cliente: v.cliente, suscripcion_id: v.suscripcion_id, motivo: `Aviso de vencimiento (${fechaCorta(v.fecha_termino)})` })}>Gestión</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          ))}

          {vista === 'recuperar' && (datos.a_recuperar.length === 0 ? <Vacio>Todas las instalaciones tienen suscripción vigente.</Vacio> : (
            <div className="tabla"><table>
              <thead><tr><th>Instalación</th><th>Cliente</th><th>Situación</th><th>Sin cobertura</th><th>Última gestión</th><th /></tr></thead>
              <tbody>{datos.a_recuperar.map((r) => (
                <tr key={r.instalacion_id}>
                  <td><Link to={`/admin/instalaciones/${r.instalacion_id}`}><strong>{r.instalacion}</strong></Link><small>{r.instalacion_codigo}{r.localidad ? ` · ${r.localidad}` : ''}</small></td>
                  <td><Link to={`/admin/clientes/${r.cliente_id}`}>{r.cliente}</Link></td>
                  <td><Etiqueta tono={r.ultimo_motivo_cierre === 'Falta de pago' ? 'mala' : 'neutra'}>{r.situacion === 'nunca suscrita' ? 'Nunca suscrita' : r.ultimo_motivo_cierre ? `Cerrada · ${r.ultimo_motivo_cierre.toLowerCase()}` : 'Vencida'}</Etiqueta></td>
                  <td>{r.ultima_fecha_fin ? `${r.dias_sin_cobertura} ${r.dias_sin_cobertura === 1 ? 'día' : 'días'}` : 'Desde que se instaló'}{r.ultima_fecha_fin && <small>desde el {fechaCorta(r.ultima_fecha_fin)}</small>}</td>
                  <td><Gestionada g={r.ultima_gestion} /></td>
                  <td><div className="acciones sin-corte">
                    <BotonWhatsApp telefono={r.telefono} texto={`Hola ${primerNombre(r.cliente)}, te escribimos de ENINTI. ${r.situacion === 'nunca suscrita' ? `¿Te gustaría un plan de mantención para ${r.instalacion}?` : `Tu instalación ${r.instalacion} quedó sin plan de mantención. ¿Te gustaría retomarlo?`}`} />
                    <button type="button" className="boton suave mini" onClick={() => setAccion({ cliente_id: r.cliente_id, cliente: r.cliente, motivo: r.situacion === 'nunca suscrita' ? `Ofrecer plan para ${r.instalacion}` : `Recuperar ${r.instalacion}` })}>Gestión</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          ))}

          {vista === 'gestiones' && <Gestiones version={version} />}
        </>
      )}
      {accion && (
        <RegistrarGestion clienteId={accion.cliente_id} clienteNombre={accion.cliente} suscripcionId={accion.suscripcion_id} motivoInicial={accion.motivo}
          cerrar={() => setAccion(null)} listo={() => { setAccion(null); setAviso('Gestión registrada'); setVersion((v) => v + 1); }} />
      )}
    </>
  );
}

// Historial de gestiones (095)
function Gestiones({ version }: { version: number }) {
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const p = new URLSearchParams({ pagina: String(pagina), v: String(version) });
  if (tipo) p.set('tipo', tipo);
  if (busqueda) p.set('q', busqueda);
  const { datos, error, cargando } = useDatos<{ gestiones: Gestion[]; total: number; pagina: number; por_pagina: number }>(`/admin/seguimiento/gestiones?${p}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  return (
    <>
      <div className="filtros">
        <label className="buscador-icono"><Search size={18} />
          <input className="buscador" type="search" placeholder="Cliente, motivo o resultado" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(GESTIONES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.gestiones.length === 0 ? <Vacio>No hay gestiones registradas.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Motivo</th><th>Resultado</th><th>Por</th></tr></thead>
          <tbody>{datos.gestiones.map((g) => (
            <tr key={g.id}>
              <td>{fechaCorta(g.fecha)}</td>
              <td><Link to={`/admin/clientes/${g.cliente_id}`}>{g.cliente}</Link>{g.suscripcion && <small>{g.suscripcion}</small>}</td>
              <td>{GESTIONES[g.tipo]}</td>
              <td>{g.motivo}</td>
              <td>{g.resultado ?? '—'}</td>
              <td>{g.realizada_por ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
      {datos && datos.total > datos.por_pagina && (
        <div className="paginacion">
          <span className="suave">Página {pagina} de {paginas}</span>
          <div className="acciones">
            <button type="button" className="boton secundario mini" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <button type="button" className="boton secundario mini" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
          </div>
        </div>
      )}
    </>
  );
}
