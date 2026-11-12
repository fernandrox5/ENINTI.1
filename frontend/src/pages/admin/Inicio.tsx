// T-36 · Mockup 046: inicio del administrador. Lo que pide atención hoy: indicadores, visitas de
// hoy, pagos pendientes y solicitudes nuevas. Cada cosa lleva a la pantalla donde se resuelve.
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, Check, CalendarDays, CircleCheck, CreditCard, Inbox, RefreshCw, Wrench, Zap } from 'lucide-react';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Kpi, Saludo } from '../../componentes';
import { TIPOS_MANTENCION, pesos } from '../../formato';
import { TIPO_SOLICITUD } from '../../estados';
import { whatsapp } from './seguimiento/Seguimiento';

interface Datos {
  nombre: string; vigentes: number; ingreso_mensual: number; cobrado_mes: number; sin_plan: number; semana: number; semana_sin_tecnico: number;
  atrasadas: number; solicitudes_nuevas: number; emergencias: number; por_validar: number;
  pagos_pendientes: { suscripcion_id: number; cliente_id: number; cliente: string; telefono: string | null; instalacion: string; monto: number; quedan_dias: number }[];
  hoy: { id: number; tipo: string; hora_inicio: string | null; instalacion: string; cliente: string; tecnico: string | null }[];
  solicitudes: { id: number; tipo: string; created_at: string; cliente: string; instalacion: string | null }[];
}

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };
const fechaHoy = () => new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (l) => l.toUpperCase());

export default function Inicio() {
  const { datos: d, error, cargando } = useDatos<Datos>('/admin/inicio');
  if (cargando && !d) return <Cargando />;
  if (!d) return <Aviso>{error}</Aviso>;
  const nombre = d.nombre.split(' ')[0];
  // Alertas: solo las que existen
  const alertas = [
    d.emergencias > 0 && { a: '/admin/solicitudes', icono: Zap, tono: 'mala', texto: `${d.emergencias} ${d.emergencias === 1 ? 'emergencia' : 'emergencias'} sin visita agendada` },
    d.atrasadas > 0 && { a: '/admin/mantenciones', icono: AlertTriangle, tono: 'mala', texto: `${d.atrasadas} ${d.atrasadas === 1 ? 'visita atrasada' : 'visitas atrasadas'} sin informe` },
    d.semana_sin_tecnico > 0 && { a: '/admin/mantenciones', icono: Wrench, tono: 'alerta', texto: `${d.semana_sin_tecnico} ${d.semana_sin_tecnico === 1 ? 'visita' : 'visitas'} de esta semana sin técnico` },
    d.por_validar > 0 && { a: '/admin/pagos?vista=validar', icono: Inbox, tono: 'alerta', texto: `${d.por_validar} ${d.por_validar === 1 ? 'comprobante' : 'comprobantes'} por revisar` },
  ].filter(Boolean) as { a: string; icono: typeof Zap; tono: string; texto: string }[];

  return (
    <>
      <Saludo fecha={fechaHoy()} titulo={`${saludo()}, ${nombre}`}
        texto={alertas.length ? `Hay ${alertas.length} ${alertas.length === 1 ? 'cosa' : 'cosas'} por revisar.` : 'Todo al día. No hay nada urgente.'}>
        {alertas.length > 0 && (
          <div className="saludo-alertas">
            {alertas.map((x) => <Link key={x.texto} to={x.a} className={`pildora-alerta ${x.tono}`}><x.icono size={16} />{x.texto}<span>Revisar ›</span></Link>)}
          </div>
        )}
        <Link to="/admin/mantenciones" className="boton secundario chico"><Calendar size={18} /> Ver calendario</Link>
      </Saludo>

      <div className="kpis">
        <Kpi icono={RefreshCw} titulo="Planes activos" valor={d.vigentes} enlace={`${pesos(d.ingreso_mensual)} al mes`} a="/admin/suscripciones" />
        <Kpi icono={CreditCard} titulo="Cobrado este mes" valor={pesos(d.cobrado_mes)} enlace="Ver pagos" a="/admin/pagos" tono="destacada" />
        <Kpi icono={CircleCheck} titulo="Pagos pendientes" valor={d.pagos_pendientes.length} enlace="Ver seguimiento" a="/admin/seguimiento" tono={d.pagos_pendientes.length ? 'mala' : undefined} />
        <Kpi icono={CalendarDays} titulo="Visitas esta semana" valor={d.semana} enlace={`${d.sin_plan} instalaciones sin plan`} a="/admin/mantenciones" />
      </div>

      <div className="grilla-3 arriba-alineado inicio-listas">
        <section className="tarjeta">
          <header className="tarjeta-cabecera"><h2><span className="cabecera-icono"><CalendarDays size={16} /></span>Visitas de hoy</h2><Link to="/admin/mantenciones">Calendario ›</Link></header>
          {d.hoy.length === 0 ? <p className="suave">No hay visitas hoy.</p> : (
            <ul className="lista-simple">{d.hoy.map((m) => (
              <li key={m.id}><Link to={`/admin/mantenciones/${m.id}`} className="fila-enlace">
                <span><strong>{m.hora_inicio ? m.hora_inicio.slice(0, 5) : 'Sin hora'} · {m.instalacion}</strong><small className="suave">{m.cliente} · {m.tecnico ?? 'sin técnico'}</small></span>
                {m.tipo === 'emergencia' ? <Etiqueta tono="mala">Emergencia</Etiqueta> : <Etiqueta tono="neutra">{TIPOS_MANTENCION[m.tipo]}</Etiqueta>}
              </Link></li>
            ))}</ul>
          )}
        </section>

        <section className="tarjeta">
          <header className="tarjeta-cabecera"><h2><span className="cabecera-icono"><CreditCard size={16} /></span>Pagos pendientes</h2><Link to="/admin/seguimiento">Ver todos ›</Link></header>
          {d.pagos_pendientes.length === 0 ? <p className="vacio-ok"><Check size={16} /> Todos al día.</p> : (
            <ul className="lista-simple">{d.pagos_pendientes.slice(0, 5).map((p) => {
              const wa = whatsapp(p.telefono, `Hola ${p.cliente.split(' ')[0]}, te escribimos de ENINTI. Tu pago de este mes de ${p.instalacion} está pendiente.`);
              return (
                <li key={p.suscripcion_id}>
                  <span><Link to={`/admin/clientes/${p.cliente_id}`}><strong>{p.cliente}</strong></Link><small className="suave">{p.instalacion} · {pesos(p.monto)}</small></span>
                  <Etiqueta tono={p.quedan_dias <= 2 ? 'mala' : 'alerta'}>{p.quedan_dias === 0 ? 'Último día' : `${p.quedan_dias} días`}</Etiqueta>
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="boton secundario mini">WhatsApp</a>}
                </li>
              );
            })}</ul>
          )}
        </section>

        <section className="tarjeta">
          <header className="tarjeta-cabecera"><h2><span className="cabecera-icono"><Inbox size={16} /></span>Solicitudes nuevas</h2><Link to="/admin/solicitudes">Ver todas ›</Link></header>
          {d.solicitudes.length === 0 ? <p className="vacio-ok"><Check size={16} /> No hay solicitudes nuevas.</p> : (
            <ul className="lista-simple">{d.solicitudes.map((s) => (
              <li key={s.id}><Link to={`/admin/solicitudes?id=${s.id}`} className="fila-enlace">
                <span><strong>{s.cliente}</strong><small className="suave">{s.instalacion ?? 'Sin instalación'}</small></span>
                <Etiqueta tono={s.tipo === 'emergencia' ? 'mala' : 'neutra'}>{TIPO_SOLICITUD[s.tipo]}</Etiqueta>
              </Link></li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}
