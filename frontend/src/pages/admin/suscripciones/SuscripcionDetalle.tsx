// T-21 · Mockups 073 a 076: detalle de la suscripción con renovar, cambiar de plan y cerrar.
// La suscripción la contrata (y cancela) el cliente desde su portal; aquí ENINTI la ve y, solo en casos
// excepcionales, la cierra con motivo.
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Campo, Cargando, Etiqueta, Modal, Selector, Volver } from '../../../componentes';
import { FRECUENCIAS, TIPOS_MANTENCION, fechaCorta, hoyISO, mes, pesos } from '../../../formato';
import { ESTADO_MANTENCION, ESTADO_PAGO, estadoSuscripcion } from '../../../estados';
import { Quedan, situacionPago } from './Suscripciones';

interface Eslabon { id: number; codigo: string; estado: string; tipo_nombre: string; motivo_cierre?: string | null }
export interface DetalleSuscripcion {
  id: number; codigo: string; estado: 'vigente' | 'vencida' | 'cerrada'; tipo_suscripcion_id: number; tipo_nombre: string;
  fecha_inicio: string; fecha_termino: string; fecha_cierre: string | null; motivo_cierre: string | null; meses_gratis: number;
  monto_pactado: number; frecuencia_pago: string; mantenciones_por_anio: number; duracion_meses: number; monto_plan: number;
  instalacion_id: number; instalacion_codigo: string; instalacion_nombre: string | null; direccion: string;
  cliente_id: number; cliente_nombre: string; dias_restantes: number; periodos_esperados: number; periodos_pagados: number;
  periodos_adeudados: number; monto_adeudado: number; pagado_hasta: string | null; pagos_por_validar: number;
  condiciones_version: string | null; condiciones_archivo: string | null; acepto_condiciones_at: string | null; creada_por: string | null;
  anterior: Eslabon | null; siguiente: Eslabon | null;
  mantenciones: { id: number; numero_en_plan: number | null; tipo: string; estado: string; fecha_programada: string | null; fecha_realizada: string | null; tecnico: string | null }[];
  pagos: { id: number; periodo: string; monto: number; estado: string; medio_pago: string; fecha_pago: string | null }[];
}

export const MOTIVOS_CIERRE = ['Cliente se va', 'No pagó', 'Cambio o retiro de equipos', 'Venta de la propiedad', 'Otro'];

// Porcentaje transcurrido de la vigencia
function avance(inicio: string, termino: string, hasta?: string) {
  const i = Date.parse(inicio), t = Date.parse(termino), h = Date.parse(hasta ?? hoyISO());
  return Math.min(100, Math.max(0, ((h - i) / (t - i)) * 100));
}

// "1 mes", "3 meses", "menos de un mes"
function duracionTexto(inicio: string, fin: string) {
  const [a1, m1, d1] = inicio.split('-').map(Number), [a2, m2, d2] = fin.slice(0, 10).split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return meses < 1 ? 'menos de un mes' : `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

export default function SuscripcionDetalle() {
  const { id } = useParams();
  const avisoAlLlegar = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [params, setParams] = useSearchParams();
  const { datos: s, error, cargando, recargar } = useDatos<DetalleSuscripcion>(`/admin/suscripciones/${id}`);
  const [aviso, setAviso] = useState('');
  const accion = params.get('accion');
  const abrir = (a: string) => setParams({ accion: a }, { replace: true });
  const cerrarModal = useCallback(() => setParams({}, { replace: true }), [setParams]);

  if (cargando && !s) return <Cargando />;
  if (!s) return <><Volver a="/admin/suscripciones" texto="Suscripciones" /><Aviso>{error || 'Suscripción no encontrada'}</Aviso></>;

  const [tonoEstado, textoEstado] = estadoSuscripcion(s);
  const [tonoPago, textoPago] = situacionPago(s);
  const realizadas = s.mantenciones.filter((m) => m.estado === 'realizada').length;
  const delPlan = s.mantenciones.filter((m) => m.estado !== 'cancelada').length;
  const porValidar = s.pagos.find((p) => p.estado === 'pendiente');
  // Hasta dónde llegó: hoy si está vigente; la fecha de cierre si se cerró
  const transcurrido = avance(s.fecha_inicio, s.fecha_termino, s.fecha_cierre ?? undefined);

  return (
    <>
      <Volver a="/admin/suscripciones" texto="Suscripciones" />
      <div className="ficha-cabecera">
        <div className="ficha-titulo">
          <h1>{s.tipo_nombre} <span className="suave">· {s.instalacion_nombre || s.direccion}</span></h1>
          <p>
            <Link to={`/admin/clientes/${s.cliente_id}`}>{s.cliente_nombre}</Link> ·
            <Link to={`/admin/instalaciones/${s.instalacion_id}`}>{s.instalacion_codigo}</Link>
            <span className="codigo-chico">{s.codigo}</span>
            <Etiqueta tono={tonoEstado} punto>{s.estado === 'vigente' && s.dias_restantes <= 30 ? `Vigente · ${s.dias_restantes <= 0 ? 'vence hoy' : `vence en ${s.dias_restantes} días`}` : textoEstado}</Etiqueta>
            {s.estado !== 'cerrada' && <Etiqueta tono={tonoPago}>{textoPago}</Etiqueta>}
          </p>
        </div>
        <div className="acciones">
          {s.estado !== 'cerrada' && !s.siguiente && <button type="button" className="boton peligro chico" onClick={() => abrir('cerrar')}>Cerrar</button>}
        </div>
      </div>
      <Aviso tipo="ok">{aviso || avisoAlLlegar}</Aviso>

      <div className="grilla-2 arriba-alineado">
        <div className="columna">
          <section className="tarjeta">
            <h2>Plan</h2>
            <dl className="datos lineas">
              <div><dt>Plan</dt><dd>{s.tipo_nombre}</dd></div>
              <div><dt>Monto pactado</dt><dd>{pesos(s.monto_pactado)} {FRECUENCIAS[s.frecuencia_pago]}{s.monto_pactado !== s.monto_plan && <small className="suave"> (plan: {pesos(s.monto_plan)})</small>}</dd></div>
              <div><dt>Mantenciones</dt><dd>{s.mantenciones_por_anio} al año · dura {s.duracion_meses} meses</dd></div>
            </dl>
          </section>

          <section className="tarjeta">
            <header className="tarjeta-cabecera"><h2>Vigencia</h2>
              <strong>{s.estado === 'vigente' ? <Quedan dias={s.dias_restantes} /> : s.estado === 'cerrada' ? `Cerrada el ${fechaCorta(s.fecha_cierre)}` : `Venció el ${fechaCorta(s.fecha_termino)}`}</strong></header>
            <div className="vigencia-fechas"><span>Inicio {fechaCorta(s.fecha_inicio)}</span><span>Término {fechaCorta(s.fecha_termino)}</span></div>
            <div className={`barra-progreso ${s.estado === 'cerrada' ? 'cerrada' : ''}`} role="progressbar" aria-valuenow={Math.round(transcurrido)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${transcurrido}%` }} />
            </div>
            {s.estado === 'cerrada' && <p className="suave nota">Duró {duracionTexto(s.fecha_inicio, s.fecha_cierre!)} de {s.duracion_meses} meses.</p>}
            {s.motivo_cierre && <p className="suave nota">Motivo del cierre: {s.motivo_cierre}</p>}
          </section>

          <section className="tarjeta">
            <header className="tarjeta-cabecera"><h2>Pagos</h2>
</header>
            <dl className="datos lineas">
              <div><dt>Meses pagados</dt><dd>{s.periodos_pagados}</dd></div>
              <div><dt>Pagado hasta</dt><dd>{s.pagado_hasta ? fechaCorta(s.pagado_hasta) : 'Sin pagos'}</dd></div>
              {s.periodos_adeudados > 0 && s.estado === 'vigente' && <div><dt>Pago del mes</dt><dd className="texto-malo">Pendiente · {pesos(s.monto_pactado)}</dd></div>}
              {porValidar && <div><dt>Por validar</dt><dd><Link to="/admin/pagos?vista=validar">{mes(porValidar.periodo)} · {pesos(porValidar.monto)} ›</Link></dd></div>}
            </dl>
            {s.pagos.length > 0 && (
              <details className="desplegable">
                <summary>{s.pagos.length === 1 ? 'Ver el pago' : `Ver los ${s.pagos.length} pagos`}</summary>
                <ul className="lista-simple">
                  {s.pagos.map((p) => (
                    <li key={p.id}><span>{mes(p.periodo)}</span><span>{pesos(p.monto)}</span>
                      <Etiqueta tono={ESTADO_PAGO[p.estado][0]}>{ESTADO_PAGO[p.estado][1]}</Etiqueta></li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>

        <div className="columna">
          <section className="tarjeta">
            <header className="tarjeta-cabecera"><h2>Mantenciones del plan</h2>{delPlan > 0 && <span className="suave">{realizadas} de {delPlan} realizadas</span>}</header>
            {s.mantenciones.length === 0 ? <p className="suave">Esta suscripción no tiene mantenciones agendadas.</p> : (
              <ul className="lista-simple">
                {s.mantenciones.map((m) => (
                  <li key={m.id}>
                    <span><strong>{fechaCorta(m.fecha_realizada ?? m.fecha_programada)}</strong>
                      <small className="suave">{TIPOS_MANTENCION[m.tipo]}{m.numero_en_plan ? ` ${m.numero_en_plan} del plan` : ''} · {m.tecnico ?? 'sin técnico'}</small></span>
                    <Etiqueta tono={ESTADO_MANTENCION[m.estado][0]}>{ESTADO_MANTENCION[m.estado][1]}</Etiqueta>
                    <Link to={`/admin/mantenciones/${m.id}`} className="boton secundario mini">Ver</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta">
            <h2>Condiciones del servicio</h2>
            <dl className="datos lineas">
              <div><dt>Versión aceptada</dt><dd>{s.condiciones_version ?? (s.estado === 'cerrada' ? 'No registradas' : 'Pendiente: el cliente las acepta en su portal')}</dd></div>
              {s.acepto_condiciones_at && <div><dt>Aceptada</dt><dd>{fechaCorta(s.acepto_condiciones_at)}</dd></div>}
              {s.creada_por && <div><dt>Creada por</dt><dd>{s.creada_por}</dd></div>}
            </dl>
          </section>

          {(s.anterior || s.siguiente) && (
            <section className="tarjeta">
              <h2>Otras suscripciones de esta instalación</h2>
              <ul className="lista-simple">
                {[s.anterior && ['Anterior', s.anterior] as const, s.siguiente && ['Siguiente', s.siguiente] as const].filter(Boolean).map((x) => {
                  const [cual, e] = x as readonly [string, Eslabon];
                  return (
                    <li key={e.id}><Link to={`/admin/suscripciones/${e.id}`} className="fila-enlace">
                      <span><strong>{e.tipo_nombre}</strong><small className="suave">{cual} · {e.motivo_cierre ? `cerrado: ${e.motivo_cierre.toLowerCase()}` : estadoSuscripcion(e)[1].toLowerCase()}</small></span>
                      <span className="codigo-chico">{e.codigo}</span>
                    </Link></li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      {accion === 'cerrar' && s.estado !== 'cerrada' && !s.siguiente && (
        <Cerrar s={s} cerrar={cerrarModal} listo={(n) => { cerrarModal(); setAviso(`${s.codigo} quedó cerrada${n ? ` y se cancelaron ${n} ${n === 1 ? 'mantención' : 'mantenciones'}` : ''}`); recargar(); }} />
      )}
    </>
  );
}

function Cerrar({ s, cerrar, listo }: { s: DetalleSuscripcion; cerrar: () => void; listo: (canceladas: number) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_CIERRE[0]);
  const [otro, setOtro] = useState('');
  const [fecha, setFecha] = useState(hoyISO() < s.fecha_inicio ? s.fecha_inicio : hoyISO());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const futuras = s.mantenciones.filter((m) => m.estado === 'programada' && m.fecha_programada && m.fecha_programada > fecha);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const texto = motivo === 'Otro' ? otro.trim() : motivo;
    if (!texto) return setError('Escribe el motivo');
    setError('');
    setGuardando(true);
    try {
      const r = await api<{ mantenciones_canceladas: number }>(`/admin/suscripciones/${s.id}/cerrar`, { method: 'POST', body: { motivo: texto, fecha } });
      listo(r.mantenciones_canceladas);
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Cerrar ${s.codigo}`} cerrar={cerrar} ancho={620}>
      <form className="formulario dos" onSubmit={enviar} noValidate>
        <Selector etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS_CIERRE.map((m) => <option key={m}>{m}</option>)}
        </Selector>
        <Campo etiqueta="Fecha de cierre" type="date" value={fecha} min={s.fecha_inicio} onChange={(e) => setFecha(e.target.value)} />
        {motivo === 'Otro' && <div className="completo"><Campo etiqueta="¿Cuál es el motivo?" value={otro} onChange={(e) => setOtro(e.target.value)} autoFocus /></div>}
        <p className="nota-peligro completo">
          {futuras.length === 0 ? 'No hay mantenciones futuras que cancelar. '
            : `Se ${futuras.length === 1 ? 'cancelará sola 1 mantención futura' : `cancelarán solas ${futuras.length} mantenciones futuras`} (${futuras.map((m) => fechaCorta(m.fecha_programada)).join(', ')}). `}
          {s.estado === 'vigente' && 'La instalación pasará a "Clientes a recuperar". '}Nada se borra: queda en el historial.
        </p>
        <div className="completo"><Aviso>{error}</Aviso></div>
        <div className="completo botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className="boton peligro lleno chico" disabled={guardando}>{guardando ? 'Cerrando…' : 'Cerrar suscripción'}</button>
        </div>
      </form>
    </Modal>
  );
}
