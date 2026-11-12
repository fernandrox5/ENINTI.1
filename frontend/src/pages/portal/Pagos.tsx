// Portal del cliente · Mockups 018, 026 y 045: lo que debe, su tarjeta para el cobro automático
// (como una suscripción de streaming: se cobra sola el mismo día de cada mes) y el pago en línea con Flow.
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { api } from '../../api';
import { useDatos } from '../../useDatos';
import { Aviso, Cargando, Etiqueta, Modal, Selector, Titulo, Vacio } from '../../componentes';
import { FRECUENCIAS, MEDIOS, fechaCorta, hoyISO, mes, pesos } from '../../formato';
import { ESTADO_PAGO } from '../../estados';

interface Suscripcion {
  id: number; codigo: string; estado: string; tipo_nombre: string; monto_pactado: number; frecuencia_pago: string; fecha_termino: string;
  pagado_hasta: string | null; periodos_adeudados: number; monto_adeudado: number; pagos_por_validar: number;
  pendiente: { desde: string; quedan_dias: number } | null;
  instalacion_nombre: string | null; instalacion_codigo: string; direccion: string; proximo_cobro: string | null;
}
interface Datos {
  cliente: string; email: string | null; tarjeta: { tipo: string | null; ultimos4: string | null; inscrita_at: string } | null;
  suscripciones: Suscripcion[];
  pagos: { id: number; periodo: string; monto: number; fecha_pago: string | null; medio_pago: string; estado: string; nro_boleta: string | null; motivo_rechazo: string | null; suscripcion: string; en_linea: boolean }[];
}

const RESULTADOS: Record<string, ['ok' | 'error' | 'info', string]> = {
  pagado: ['ok', '¡Pago recibido! Ya quedó registrado en tu cuenta.'],
  rechazado: ['error', 'El pago fue rechazado. Puedes intentarlo de nuevo con otro medio.'],
  anulado: ['error', 'El pago se canceló. No se te cobró nada.'],
  pendiente: ['info', 'Tu pago está en proceso. Apenas Flow lo confirme aparecerá aquí como pagado.'],
};
const TARJETA: Record<string, ['ok' | 'error', string]> = {
  inscrita: ['ok', 'Tarjeta inscrita. Desde ahora tu suscripción se paga sola cada mes.'],
  rechazada: ['error', 'No se pudo inscribir la tarjeta. Intenta de nuevo o usa otra.'],
  error: ['error', 'No pudimos confirmar la inscripción de tu tarjeta. Intenta de nuevo en unos minutos.'],
};
const mesLargo = (f: string) => mes(f).replace(/^(\w)/, (l) => l.toUpperCase());

export default function Pagos() {
  const [params] = useSearchParams();
  const { datos: d, error, cargando, recargar } = useDatos<Datos>('/portal/pagos');
  const [ocupado, setOcupado] = useState('');
  const [falla, setFalla] = useState('');
  const [cancelar, setCancelar] = useState<Suscripcion | null>(null);
  const [avisoCancelar, setAvisoCancelar] = useState('');
  const resultado = RESULTADOS[params.get('resultado') ?? ''] ?? TARJETA[params.get('tarjeta') ?? ''];

  // Flow abre su propia página (pago o inscripción) y al terminar vuelve aquí
  const irAFlow = async (clave: string, ruta: string, body?: unknown) => {
    setFalla('');
    setOcupado(clave);
    try {
      const r = await api<{ url: string }>(ruta, { method: 'POST', body });
      window.location.href = r.url;
    } catch (e) { setFalla((e as Error).message); setOcupado(''); }
  };
  const quitarTarjeta = async () => {
    if (!window.confirm('¿Quitar tu tarjeta? Tu suscripción ya no se pagará sola: tendrás que pagar cada mes con el botón "Pagar".')) return;
    setOcupado('quitar');
    try { await api('/portal/pagos/tarjeta', { method: 'DELETE' }); recargar(); } catch (e) { setFalla((e as Error).message); } finally { setOcupado(''); }
  };

  if (cargando && !d) return <Cargando />;
  if (!d) return <Aviso>{error}</Aviso>;
  const diaCobro = (s: Suscripcion) => (s.proximo_cobro ? Number(s.proximo_cobro.slice(8, 10)) : null);

  return (
    <div className="pagina-portal">
      <Titulo icono={CreditCard} fuerte="Pagos" />
      {resultado && <Aviso tipo={resultado[0]}>{resultado[1]}</Aviso>}
      <Aviso>{falla}</Aviso>

      <div className="grilla-3">
        {d.suscripciones.map((s) => {
          // Con tarjeta, el día del cobro todavía no está pendiente: se cobra sola
          const p = s.pendiente && !(d.tarjeta && s.pendiente.desde === hoyISO()) ? s.pendiente : null;
          return (
            <section key={s.id} className={`tarjeta pago-tarjeta ${p ? 'debe' : ''}`}>
              {p ? <Etiqueta tono="mala" punto>Pago pendiente</Etiqueta>
                : s.pagos_por_validar > 0 ? <Etiqueta tono="alerta" punto>Pago en revisión</Etiqueta>
                  : <Etiqueta tono="buena" punto>Al día</Etiqueta>}
              <strong className="pago-monto">{pesos(s.monto_pactado)} <small>{FRECUENCIAS[s.frecuencia_pago]}</small></strong>
              <p className="suave">{s.instalacion_nombre || s.direccion} · {s.tipo_nombre}</p>
              {p ? (
                <p className="texto-malo">{d.tarjeta ? 'No pudimos cobrar tu tarjeta. ' : ''}{p.quedan_dias === 0 ? 'Hoy es el último día' : `Tienes ${p.quedan_dias} ${p.quedan_dias === 1 ? 'día' : 'días'}`} para pagar; si no, tu plan se cancelará.</p>
              ) : (
                <p className="suave">
                  {s.pagado_hasta ? `Pagado hasta ${mesLargo(s.pagado_hasta).toLowerCase()}. ` : ''}
                  {s.proximo_cobro && (d.tarjeta ? `Se cobra solo el ${fechaCorta(s.proximo_cobro)}.` : `Próximo pago: ${fechaCorta(s.proximo_cobro)}.`)}
                </p>
              )}
              {p ? (
                <button type="button" className="boton primario" disabled={Boolean(ocupado)} onClick={() => irAFlow(`pagar-${s.id}`, '/portal/pagos/pagar', { suscripcion_id: s.id })}>
                  {ocupado === `pagar-${s.id}` ? 'Abriendo Flow…' : `Pagar ${pesos(s.monto_pactado)}`}</button>
              ) : null}
              <button type="button" className="enlace-suave" onClick={() => setCancelar(s)}>Cancelar suscripción</button>
            </section>
          );
        })}

        {d.tarjeta && <section className="tarjeta pago-tarjeta">
          <h2><CreditCard size={20} /> {d.tarjeta.tipo ?? 'Tarjeta'} ···· {d.tarjeta.ultimos4 ?? ''}</h2>
          <p className="suave">Se cobra sola{d.suscripciones[0] && diaCobro(d.suscripciones[0]) ? ` el día ${diaCobro(d.suscripciones[0])} de cada mes` : ' cada mes'}.</p>
          <div className="acciones">
            <button type="button" className="boton suave chico" disabled={Boolean(ocupado)} onClick={() => irAFlow('tarjeta', '/portal/pagos/tarjeta')}>Cambiar tarjeta</button>
            <button type="button" className="boton peligro chico" disabled={Boolean(ocupado)} onClick={quitarTarjeta}>Quitar</button>
          </div>
        </section>}
      </div>
      {d.suscripciones.length === 0 && (
        <Vacio>Tus instalaciones no tienen una suscripción de mantención vigente, así que no tienes pagos mensuales. <Link to="/portal/planes">Conoce los planes</Link></Vacio>
      )}

      {cancelar && <Cancelar s={cancelar} cerrar={() => setCancelar(null)} listo={(hasta) => { setCancelar(null); setAvisoCancelar(`Listo: tu suscripción quedó cancelada. Sigues cubierto hasta el ${fechaCorta(hasta)} y no se te cobrará más.`); recargar(); }} />}
      <Aviso tipo="ok">{avisoCancelar}</Aviso>
      <h2 className="subtitulo">Pagos anteriores</h2>
      {d.pagos.length === 0 ? <Vacio>Aún no tienes pagos registrados.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Mes</th><th className="num">Monto</th><th className="solo-escritorio">Pagado el</th><th className="solo-escritorio">Medio</th><th className="solo-escritorio">Boleta</th><th>Estado</th></tr></thead>
          <tbody>{d.pagos.map((p) => (
            <tr key={p.id}>
              <td>{mesLargo(p.periodo)}</td>
              <td className="num">{pesos(p.monto)}</td>
              <td className="solo-escritorio">{p.fecha_pago ? fechaCorta(p.fecha_pago) : '—'}</td>
              <td className="solo-escritorio">{MEDIOS[p.medio_pago] ?? p.medio_pago}</td>
              <td className="solo-escritorio">{p.nro_boleta ?? '—'}</td>
              <td><Etiqueta tono={ESTADO_PAGO[p.estado][0]}>{p.estado === 'pendiente' ? 'En revisión' : ESTADO_PAGO[p.estado][1]}</Etiqueta>
                {p.motivo_rechazo && <small>{p.motivo_rechazo}</small>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

const MOTIVOS_CANCELAR = ['Ya no lo necesito', 'Es muy caro', 'Vendí o cambié la propiedad', 'No quedé conforme con el servicio', 'Otro'];

function Cancelar({ s, cerrar, listo }: { s: Suscripcion; cerrar: () => void; listo: (hasta: string) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELAR[0]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try { const r = await api<{ cubierta_hasta: string }>('/portal/pagos/cancelar', { method: 'POST', body: { suscripcion_id: s.id, motivo } }); listo(r.cubierta_hasta); }
    catch (err) { setError((err as Error).message); setEnviando(false); }
  };
  return (
    <Modal titulo="Cancelar suscripción" cerrar={cerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <p>Vas a cancelar el {s.tipo_nombre} de <strong>{s.instalacion_nombre || s.direccion}</strong>. Sigues cubierto hasta el fin del mes que ya pagaste{s.pagado_hasta ? ` (${fechaCorta(s.pagado_hasta)})` : ''} y no se te cobrará más. Las mantenciones posteriores se cancelan.</p>
        <Selector etiqueta="¿Por qué cancelas?" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS_CANCELAR.map((m) => <option key={m}>{m}</option>)}
        </Selector>
        <p className="suave">Si cambias de opinión, puedes volver a contratar cuando quieras desde Planes.</p>
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Mantener mi plan</button>
          <button className="boton peligro lleno chico" disabled={enviando}>{enviando ? 'Cancelando…' : 'Cancelar suscripción'}</button>
        </div>
      </form>
    </Modal>
  );
}
