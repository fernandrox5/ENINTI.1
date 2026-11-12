// T-27 · Mockups 009 a 017 y 044: instalaciones del cliente y su ficha (resumen, equipos,
// documentos visibles y suscripción con su historial).
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, FileText, LayoutGrid, RefreshCw, Tag } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Pestanas, Titulo, Vacio, Volver } from '../../componentes';
import { FRECUENCIAS, TIPOS_EQUIPO, fechaCorta, mes, pesos } from '../../formato';
import { describirEquipo, vidaUtil } from '../admin/instalaciones/comun';
import { SISTEMAS_LARGO } from '../admin/instalaciones/comun';
import { TarjetaInstalacion, situacionPortal, type InstalacionPortal } from './Inicio';

interface Ficha extends InstalacionPortal {
  equipos: { id: number; tipo: string; marca: string | null; modelo: string | null; cantidad: number; potencia_unitaria_w: string | null; capacidad_kwh: string | null;
    fecha_instalacion: string | null; garantia_hasta: string | null; activo: boolean; fecha_retiro: string | null; motivo_retiro: string | null; fin_vida_util: string | null }[];
  documentos: { id: number; tipo: string; nombre: string; created_at: string }[];
  suscripciones: { id: number; codigo: string; estado: string; plan: string; fecha_inicio: string; fecha_termino: string; fecha_cierre: string | null; motivo_cierre: string | null;
    version_condiciones: string | null; acepto_condiciones_at: string | null }[];
  detalle_plan: { nombre: string; descripcion: string | null; mantenciones_por_anio: number; duracion_meses: number; incluye_reposicion_equipos: boolean;
    tiempo_respuesta_horas: number | null; realizadas: number; del_plan: number } | null;
}
type Pestana = 'resumen' | 'equipos' | 'documentos' | 'suscripcion';

export function Instalaciones() {
  const { datos, error, cargando } = useDatos<InstalacionPortal[]>('/portal/instalaciones');
  if (cargando && !datos) return <Cargando />;
  return (
    <div className="pagina-portal">
      <Titulo icono={LayoutGrid} fuerte="Mis instalaciones" />
      <Aviso>{error}</Aviso>
      {datos && (datos.length === 0 ? <Vacio>Aún no tienes instalaciones registradas.</Vacio>
        : <div className="grilla-2">{datos.map((i) => <TarjetaInstalacion key={i.id} i={i} />)}</div>)}
    </div>
  );
}

export function FichaInstalacion() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const pestana = (params.get('pestana') as Pestana) || 'resumen';
  const { datos: i, error, cargando } = useDatos<Ficha>(`/portal/instalaciones/${id}`);
  if (cargando && !i) return <Cargando />;
  if (!i) return <div className="pagina-portal"><Volver a="/portal/instalaciones" texto="Instalaciones" /><Aviso>{error}</Aviso></div>;
  const [tono, texto] = situacionPortal(i);
  const activos = i.equipos.filter((e) => e.activo);
  const vigente = i.suscripciones.find((s) => s.estado === 'vigente') ?? null;
  const anteriores = i.suscripciones.filter((s) => s.id !== vigente?.id);
  const abrir = async (docId: number) => {
    try { const { url } = await api<{ url: string }>(`/portal/instalaciones/${i.id}/documentos/${docId}`); window.open(url, '_blank', 'noopener'); }
    catch (e) { window.alert((e as Error).message); }
  };

  return (
    <div className="pagina-portal">
      <Volver a="/portal/instalaciones" texto="Instalaciones" />
      <div className="encabezado"><h1 className="titulo-pagina">{i.nombre || i.codigo}</h1><Etiqueta tono={tono} punto>{texto}</Etiqueta></div>
      <Pestanas<Pestana> valor={pestana} cambiar={(p) => setParams(p === 'resumen' ? {} : { pestana: p }, { replace: true })} opciones={[
        ['resumen', 'Resumen'], ['equipos', 'Equipos', activos.length], ['documentos', 'Documentos', i.documentos.length], ['suscripcion', 'Suscripción'],
      ]} />

      {pestana === 'resumen' && (
        <>
          <span className="foto-ancha redondeada" aria-hidden="true" />
          <section className="tarjeta">
            <dl className="datos lineas">
              <div><dt>Dirección</dt><dd>{i.direccion}</dd></div>
              <div><dt>Localidad</dt><dd>{i.localidad && i.comuna && i.localidad !== i.comuna ? `${i.localidad}, ${i.comuna}` : i.localidad || i.comuna || '—'}</dd></div>
              <div><dt>Fecha de instalación</dt><dd>{i.fecha_instalacion ? fechaCorta(i.fecha_instalacion) : '—'}</dd></div>
              <div><dt>Potencia</dt><dd>{i.potencia_kwp ? `${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : '—'}</dd></div>
              <div><dt>Tipo de sistema</dt><dd>{i.tipo_sistema ? SISTEMAS_LARGO[i.tipo_sistema] : '—'}</dd></div>
            </dl>
          </section>
          {i.suscripcion_id ? (
            <button type="button" className="aviso-portal alerta" onClick={() => setParams({ pestana: 'suscripcion' })}>
              <span className="aviso-icono"><Tag size={20} /></span>
              <span><strong>{i.plan}{i.dias_restantes !== null && i.dias_restantes <= 30 ? ` · vence en ${i.dias_restantes} días` : ''}</strong><small>Ver mi suscripción ›</small></span>
            </button>
          ) : <SinPlan i={i} />}
        </>
      )}

      {pestana === 'equipos' && (i.equipos.length === 0 ? <Vacio>Aún no hay equipos registrados para esta instalación.</Vacio> : (
        <ul className="lista-equipos-portal">
          {i.equipos.map((e) => {
            const [t, v] = vidaUtil(e);
            return (
              <li key={e.id} className={e.activo ? '' : 'retirado'}>
                <span><strong>{TIPOS_EQUIPO[e.tipo]} · {describirEquipo(e)}</strong>
                  <small>{[e.marca, e.fecha_instalacion && `instalado ${fechaCorta(e.fecha_instalacion)}`, e.garantia_hasta && `garantía hasta ${fechaCorta(e.garantia_hasta)}`].filter(Boolean).join(' · ')}</small>
                  {!e.activo && <small>Retirado el {fechaCorta(e.fecha_retiro)}{e.motivo_retiro ? ` · ${e.motivo_retiro}` : ''}</small>}</span>
                <Etiqueta tono={t}>{v}</Etiqueta>
              </li>
            );
          })}
        </ul>
      ))}

      {pestana === 'documentos' && (i.documentos.length === 0 ? <Vacio>No hay documentos compartidos para esta instalación.</Vacio> : (
        <ul className="lista-menu">
          {i.documentos.map((d) => (
            <li key={d.id}><button type="button" onClick={() => abrir(d.id)}><FileText size={20} /> <span>{d.nombre}<small className="suave"> · {fechaCorta(d.created_at)}</small></span> <ChevronRight size={18} className="empujar" /></button></li>
          ))}
        </ul>
      ))}

      {pestana === 'suscripcion' && (vigente && i.detalle_plan ? (
        <div className="grilla-2 arriba-alineado">
          <div className="columna">
            <section className="tarjeta">
              <header className="tarjeta-cabecera"><h2>{i.detalle_plan.nombre}</h2><strong>{pesos(i.monto_pactado)} <small className="suave">{FRECUENCIAS[i.frecuencia_pago ?? 'mensual']}</small></strong></header>
              <ul className="beneficios">
                <li><Check size={18} /> {i.detalle_plan.mantenciones_por_anio} {i.detalle_plan.mantenciones_por_anio === 1 ? 'mantención preventiva' : 'mantenciones preventivas'} al año</li>
                {i.detalle_plan.incluye_reposicion_equipos && <li><Check size={18} /> Incluye reposición de equipos</li>}
                {i.detalle_plan.tiempo_respuesta_horas && <li><Check size={18} /> Respuesta en {i.detalle_plan.tiempo_respuesta_horas} horas</li>}
              </ul>
            </section>
            <section className="tarjeta resumen">
              <div className="vigencia-fechas"><span>{fechaCorta(i.fecha_inicio)}</span><span>{fechaCorta(i.fecha_termino)}</span></div>
              <div className="barra-progreso"><span style={{ width: `${Math.min(100, Math.max(0, 100 - ((i.dias_restantes ?? 0) / (i.detalle_plan.duracion_meses * 30.4)) * 100))}%` }} /></div>
              <div className="vigencia-fechas"><Etiqueta tono={(i.dias_restantes ?? 99) <= 30 ? 'alerta' : 'buena'} punto>{(i.dias_restantes ?? 99) <= 30 ? 'Vence pronto' : 'Vigente'}</Etiqueta><strong>Quedan {i.dias_restantes} días</strong></div>
            </section>
            <section className="tarjeta">
              <h2>Estado de pago</h2>
              <dl className="datos lineas">
                <div><dt>Meses pagados</dt><dd>{i.periodos_pagados} de {i.periodos_totales}{i.pagos_por_validar ? ` · ${i.pagos_por_validar} en revisión` : ''}</dd></div>
                <div><dt>Pagado hasta</dt><dd>{i.pagado_hasta ? mes(i.pagado_hasta) : 'Sin pagos'}</dd></div>
                <div><dt>Este mes</dt><dd className={tono === 'mala' ? 'texto-malo' : 'texto-bueno'}>{tono === 'mala' ? texto : 'Al día'}</dd></div>
              </dl>
              <Link to="/portal/pagos" className="boton suave">Ir a Pagos</Link>
            </section>
          </div>
          <div className="columna">
            <section className="tarjeta">
              <header className="tarjeta-cabecera"><h2>{i.detalle_plan.realizadas} de {i.detalle_plan.del_plan} mantenciones realizadas</h2><Link to="/portal/mantenciones">Ver mantenciones ›</Link></header>
              <div className="barra-progreso"><span style={{ width: `${i.detalle_plan.del_plan ? (i.detalle_plan.realizadas / i.detalle_plan.del_plan) * 100 : 0}%` }} /></div>
            </section>
            <section className="tarjeta">
              <h2>Condiciones</h2>
              <p className="suave">{vigente.version_condiciones ? `Versión ${vigente.version_condiciones}${vigente.acepto_condiciones_at ? ` · aceptada el ${fechaCorta(vigente.acepto_condiciones_at)}` : ''}` : 'Pendientes de aceptar.'}</p>
              <Link to="/terminos" target="_blank">Ver condiciones del servicio ›</Link>
            </section>
            {anteriores.length > 0 && <Anteriores lista={anteriores} />}
            {(i.dias_restantes ?? 99) <= 30 && (
              <section className="tarjeta destacada">
                <h2>Tu suscripción vence en {i.dias_restantes} días</h2>
                <p>Renueva para no perder tus mantenciones.</p>
                <Link to={`/portal/planes?instalacion=${i.id}`} className="boton secundario"><RefreshCw size={18} /> Quiero renovar</Link>
              </section>
            )}
          </div>
        </div>
      ) : (
        <>
          <SinPlan i={i} />
          {anteriores.length > 0 && <Anteriores lista={anteriores} />}
        </>
      ))}
    </div>
  );
}

function SinPlan({ i }: { i: InstalacionPortal }) {
  return (
    <section className="tarjeta destacada">
      <h2>{i.ultima_suscripcion ? `El plan de ${i.nombre || i.codigo} ${i.ultima_suscripcion.estado === 'cerrada' ? 'terminó' : 'venció'}` : `${i.nombre || i.codigo} no tiene plan de mantención`}</h2>
      <p>Con un plan, ENINTI agenda tus mantenciones preventivas y tus paneles rinden todo el año.</p>
      <Link to={`/portal/planes?instalacion=${i.id}`} className="boton secundario">{i.ultima_suscripcion ? 'Quiero renovar' : 'Conoce los planes'}</Link>
    </section>
  );
}

function Anteriores({ lista }: { lista: Ficha['suscripciones'] }) {
  return (
    <section className="tarjeta">
      <h2>Planes anteriores</h2>
      <ul className="lista-simple">
        {lista.map((s) => (
          <li key={s.id}><span><strong>{s.plan}</strong><small className="suave"> · {mes(s.fecha_inicio)} → {mes(s.fecha_cierre ?? s.fecha_termino)} · {s.estado === 'cerrada' ? 'cerrada' : 'vencida'}</small></span></li>
        ))}
      </ul>
    </section>
  );
}
