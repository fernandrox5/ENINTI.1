// T-36 · Mockup 046: inicio del administrador. Lo que pide atención hoy: indicadores, visitas de
// hoy, pagos pendientes y solicitudes nuevas. Cada cosa lleva a la pantalla donde se resuelve.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, Check, CalendarDays, CircleCheck, CreditCard, Inbox, Phone, RefreshCw, Wrench, Zap } from 'lucide-react';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Kpi, Saludo } from '../../componentes';
import { TIPOS_MANTENCION, fechaCorta, pesos } from '../../formato';
import { TIPO_SOLICITUD } from '../../estados';
import { whatsapp } from '../../contacto';
import RegistrarGestion from './clientes/RegistrarGestion';

interface Datos {
  nombre: string; vigentes: number; ingreso_mensual: number; cobrado_mes: number; sin_plan: number; semana: number; semana_sin_tecnico: number;
  atrasadas: number; solicitudes_nuevas: number; emergencias: number; por_validar: number;
  pagos_pendientes: { suscripcion_id: number; cliente_id: number; cliente: string; telefono: string | null; instalacion: string; monto: number; quedan_dias: number }[];
  hoy: { id: number; tipo: string; hora_inicio: string | null; instalacion: string; cliente: string; tecnico: string | null }[];
  solicitudes: { id: number; tipo: string; created_at: string; cliente: string; instalacion: string | null }[];
  para_llamar: Llamar[];
}
interface Llamar {
  clave: string; motivo: 'pago' | 'vence' | 'cerrada'; cliente_id: number; cliente: string; telefono: string | null; instalacion: string;
  suscripcion_id: number | null; dias: number; detalle: string; ultima_gestion: { tipo: string; fecha: string } | null;
}
const MENSAJE: Record<Llamar['motivo'], (x: Llamar) => string> = {
  pago: (x) => `Hola ${x.cliente.split(' ')[0]}, te escribimos de ENINTI. El pago de este mes de ${x.instalacion} está pendiente: puedes pagarlo desde tu portal y así no pierdes tu suscripción.`,
  vence: (x) => `Hola ${x.cliente.split(' ')[0]}, te escribimos de ENINTI. Tu suscripción de mantención de ${x.instalacion} está por vencer. ¿Quieres renovarla?`,
  cerrada: (x) => `Hola ${x.cliente.split(' ')[0]}, te escribimos de ENINTI. Tu instalación ${x.instalacion} quedó sin suscripción de mantención. ¿Te gustaría retomarla?`,
};

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };
const fechaHoy = () => new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (l) => l.toUpperCase());

export default function Inicio() {
  const { datos: d, error, cargando, recargar } = useDatos<Datos>('/admin/inicio');
  const [anotar, setAnotar] = useState<Llamar | null>(null);
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
        <Kpi icono={RefreshCw} titulo="Suscripciones activas" valor={d.vigentes} enlace={`${pesos(d.ingreso_mensual)} al mes`} a="/admin/suscripciones" />
        <Kpi icono={CreditCard} titulo="Cobrado este mes" valor={pesos(d.cobrado_mes)} enlace="Ver pagos" a="/admin/pagos" tono="destacada" />
        <Kpi icono={CircleCheck} titulo="Pagos pendientes" valor={d.pagos_pendientes.length} enlace="Ver pagos" a="/admin/pagos" tono={d.pagos_pendientes.length ? 'mala' : undefined} />
        <Kpi icono={CalendarDays} titulo="Visitas esta semana" valor={d.semana} enlace={`${d.sin_plan} instalaciones sin suscripción`} a="/admin/mantenciones" />
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
          <header className="tarjeta-cabecera"><h2><span className="cabecera-icono"><Phone size={16} /></span>Para llamar hoy</h2></header>
          {d.para_llamar.length === 0 ? <p className="vacio-ok"><Check size={16} /> Nadie a quien llamar hoy.</p> : (
            <ul className="lista-simple">{d.para_llamar.map((x) => {
              const wa = whatsapp(x.telefono, MENSAJE[x.motivo](x));
              return (
                <li key={x.clave}>
                  <span><Link to={`/admin/clientes/${x.cliente_id}`}><strong>{x.cliente}</strong></Link>
                    <small className={x.motivo === 'vence' ? 'suave' : 'texto-malo'}>{x.detalle}</small>
                    <small className="suave">{x.instalacion}{x.ultima_gestion ? ` · último contacto ${fechaCorta(x.ultima_gestion.fecha)}` : ''}</small></span>
                  <span className="acciones fila-acciones">
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="boton secundario mini">WhatsApp</a>}
                    <button type="button" className="boton suave mini" onClick={() => setAnotar(x)}>Anotar</button>
                  </span>
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
      {anotar && <RegistrarGestion clienteId={anotar.cliente_id} clienteNombre={anotar.cliente} suscripcionId={anotar.suscripcion_id ?? undefined}
        motivoInicial={anotar.detalle} cerrar={() => setAnotar(null)} listo={() => { setAnotar(null); recargar(); }} />}
    </>
  );
}
