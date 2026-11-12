// T-27 · Mockups 008 y 043: inicio del portal con accesos rápidos, avisos y sus instalaciones
// (con o sin suscripción: la suscripción es opcional por instalación).
import { Link } from 'react-router-dom';
import { AlertTriangle, Battery, Calendar, Clock, CreditCard, MessageCircle, Tag, Wrench, Zap } from 'lucide-react';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Saludo, Vacio, type Tono } from '../../componentes';
import { SISTEMAS, fechaCorta } from '../../formato';
import { situacionInstalacion } from '../../estados';
import { useWhatsapp } from '../../contacto';

export interface InstalacionPortal {
  id: number; codigo: string; nombre: string | null; direccion: string; potencia_kwp: string | null; tipo_sistema: string | null;
  fecha_instalacion: string | null; localidad: string | null; comuna: string | null;
  suscripcion_id: number | null; suscripcion_codigo: string | null; plan: string | null; monto_pactado: number | null; frecuencia_pago: string | null;
  fecha_inicio: string | null; fecha_termino: string | null; dias_restantes: number | null; periodos_pagados: number | null; periodos_totales: number | null;
  periodos_adeudados: number | null; monto_adeudado: number | null; pagos_por_validar: number | null; pagado_hasta: string | null;
  ultima_mantencion: string | null; proxima: string | null;
  ultima_suscripcion: { id: number; codigo: string; estado: string; fecha_termino: string; plan: string } | null;
  pago_pendiente: { desde: string; dias: number; quedan_dias: number } | null;
}

// Al día / pago pendiente con los días de plazo que quedan (la suscripción se cancela al terminar el plazo)
export function situacionPortal(i: InstalacionPortal): [Tono, string] {
  const p = i.pago_pendiente && i.pago_pendiente.dias > 0 ? i.pago_pendiente : null;
  if (p) return ['mala', p.quedan_dias === 0 ? 'Pago pendiente · último día' : `Pago pendiente · ${p.quedan_dias} ${p.quedan_dias === 1 ? 'día' : 'días'}`];
  return situacionInstalacion({ ...i, periodos_adeudados: 0 });
}
interface AvisoPortal { tipo: string; tono: 'mala' | 'alerta' | 'neutra' | 'buena' | 'info'; texto: string; accion: string; a: string }

const ICONO: Record<string, typeof Clock> = { deuda: AlertTriangle, vence: Clock, vencida: Clock, revision: CreditCard, mantencion: Calendar, equipo: Battery, sin_plan: Tag };

export const descripcion = (i: InstalacionPortal) =>
  [i.localidad, i.potencia_kwp ? `${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : null, i.tipo_sistema ? SISTEMAS[i.tipo_sistema] : null].filter(Boolean).join(' · ');

export function TarjetaInstalacion({ i }: { i: InstalacionPortal }) {
  const [tono, texto] = situacionPortal(i);
  const pagados = i.periodos_pagados ?? 0;
  const total = i.periodos_totales ?? 0;
  return (
    <article className="tarjeta instalacion-portal">
      <span className="foto-ancha" aria-hidden="true" />
      <div className="instalacion-portal-cuerpo">
        <header><h2>{i.nombre || i.codigo}</h2><Etiqueta tono={tono} punto>{texto}</Etiqueta></header>
        <p className="suave">{descripcion(i) || i.direccion}</p>
        {i.suscripcion_id ? (
          <>
            <div className="vigencia-fechas"><span className="suave">Meses pagados</span><strong>{pagados} de {total}{i.pagos_por_validar ? ` · ${i.pagos_por_validar} en revisión` : ''}</strong></div>
            <div className="barra-progreso"><span style={{ width: `${total ? Math.min(100, (pagados / total) * 100) : 0}%` }} /></div>
          </>
        ) : null}
        <div className="vigencia-fechas"><span className="suave">Próxima mantención</span>
          <strong>{i.proxima ? fechaCorta(i.proxima) : i.suscripcion_id ? 'Pídela cuando quieras' : '—'}</strong></div>
        {i.ultima_mantencion && <div className="vigencia-fechas"><span className="suave">Última mantención</span><strong>{fechaCorta(i.ultima_mantencion)}</strong></div>}
        {i.suscripcion_id
          ? <Link to={`/portal/instalaciones/${i.id}`} className="boton suave">Ver instalación</Link>
          : <div className="acciones"><Link to={`/portal/planes?instalacion=${i.id}`} className="boton primario chico">{i.ultima_suscripcion ? 'Renovar suscripción' : 'Contratar suscripción'}</Link>
            <Link to={`/portal/instalaciones/${i.id}`} className="boton suave chico">Ver instalación</Link></div>}
      </div>
    </article>
  );
}

export default function Inicio() {
  const { datos: d, error, cargando } = useDatos<{ nombre: string; instalaciones: InstalacionPortal[]; avisos: AvisoPortal[] }>('/portal/inicio');
  const wa = useWhatsapp();
  if (cargando && !d) return <Cargando />;
  if (!d) return <Aviso>{error}</Aviso>;
  const primerNombre = d.nombre.replace(/\[[^\]]*\]\s*/g, '').split(' ')[0];
  const conPlan = d.instalaciones.some((i) => i.suscripcion_id);
  return (
    <div className="pagina-portal">
      <Saludo titulo={`Hola, ${primerNombre}`} texto={d.avisos.length ? `Tienes ${d.avisos.length} ${d.avisos.length === 1 ? 'aviso' : 'avisos'}.` : 'Todo está al día.'} />
      <div className="acciones-rapidas">
        {conPlan && <Link to="/portal/pagos" className="boton primario chico"><CreditCard size={18} /> Pagos</Link>}
        <Link to="/portal/solicitudes?nueva=mantencion" className="boton secundario chico"><Wrench size={18} /> Pedir mantención</Link>
        <Link to="/portal/solicitudes?nueva=emergencia" className="boton peligro chico"><Zap size={18} /> Reportar emergencia</Link>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="boton suave chico"><MessageCircle size={18} /> WhatsApp</a>}
      </div>

      {d.avisos.length > 0 && (
        <>
          <h2 className="subtitulo">Avisos</h2>
          <div className="avisos-portal">
            {d.avisos.map((a, k) => {
              const Icono = ICONO[a.tipo] ?? Tag;
              return (
                <Link key={k} to={a.a} className={`aviso-portal ${a.tono}`}>
                  <span className="aviso-icono"><Icono size={20} /></span>
                  <span><strong>{a.texto}</strong><small>{a.accion} ›</small></span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className="subtitulo">{d.instalaciones.length === 1 ? 'Tu instalación' : 'Tus instalaciones'}</h2>
      {d.instalaciones.length === 0 ? <Vacio>Aún no tienes instalaciones registradas. Escríbenos si crees que es un error.</Vacio> : (
        <div className="grilla-2">{d.instalaciones.map((i) => <TarjetaInstalacion key={i.id} i={i} />)}</div>
      )}
    </div>
  );
}
