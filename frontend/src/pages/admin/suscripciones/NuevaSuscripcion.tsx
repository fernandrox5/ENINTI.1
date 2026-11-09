// T-21 · Mockups 077 y 078: nueva suscripción para una instalación. Si la instalación ya tiene una
// vigente no se puede crear otra: se ofrece renovarla.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Campo, Cargando, Volver } from '../../../componentes';
import { FRECUENCIAS, fechaCorta, hoyISO, mes, pesos } from '../../../formato';
import type { Opciones } from '../instalaciones/comun';

interface OpcionInstalacion {
  id: number; codigo: string; nombre: string | null; direccion: string; cliente_id: number; cliente: string;
  vigente_id: number | null; vigente_codigo: string | null; ultima_hasta: string | null;
}

// Suma meses a una fecha ISO como lo hace Postgres (si el día no existe, queda en el último del mes)
export function sumarMeses(f: string, meses: number) {
  const [a, m, d] = f.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12), mesN = total % 12;
  const dia = Math.min(d, new Date(Date.UTC(anio, mesN + 1, 0)).getUTCDate());
  return `${anio}-${String(mesN + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Mismas fechas que agenda el trigger de la base (fn_suscripciones_programar_mantenciones)
export function mantencionesPlan(inicio: string, porAnio: number, duracion: number) {
  if (!porAnio) return [];
  const cada = Math.max(1, Math.floor(12 / porAnio));
  const total = Math.ceil((porAnio * duracion) / 12);
  const termino = sumarMeses(inicio, duracion);
  const fechas: string[] = [];
  for (let i = 1; i <= total; i++) {
    const f = sumarMeses(inicio, i * cada - Math.floor(cada / 2));
    if (f > termino) break;
    fechas.push(f);
  }
  return fechas;
}

const diasDesde = (f: string) => Math.round((Date.parse(hoyISO()) - Date.parse(f)) / 864e5);

export default function NuevaSuscripcion() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const pedida = Number(params.get('instalacion')) || 0;
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusqueda(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { datos: op } = useDatos<Opciones>('/admin/instalaciones/opciones');
  const { datos: lista, cargando } = useDatos<OpcionInstalacion[]>(`/admin/suscripciones/instalaciones?instalacion=${pedida}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`);
  const [elegida, setElegida] = useState<OpcionInstalacion | null>(null);
  const [f, setF] = useState({ tipo_suscripcion_id: '', fecha_inicio: hoyISO(), meses_gratis: '0', monto_pactado: '', acepto_condiciones: false });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Preselecciona la instalación pedida (?instalacion=) y el plan más barato
  useEffect(() => { if (!elegida && pedida && lista) setElegida(lista.find((i) => i.id === pedida) ?? null); }, [lista, pedida, elegida]);
  useEffect(() => {
    if (op?.planes.length && !f.tipo_suscripcion_id) setF((x) => ({ ...x, tipo_suscripcion_id: String(op.planes[0].id), monto_pactado: String(op.planes[0].monto_clp) }));
  }, [op, f.tipo_suscripcion_id]);

  const plan = op?.planes.find((p) => String(p.id) === f.tipo_suscripcion_id) ?? null;
  const inicio = f.fecha_inicio || hoyISO();
  const meses = Math.max(0, Number(f.meses_gratis) || 0);
  const fechas = plan ? mantencionesPlan(inicio, plan.mantenciones_por_anio, plan.duracion_meses) : [];
  const bloqueada = Boolean(elegida?.vigente_id);
  // La instalación elegida siempre se muestra, aunque la búsqueda no la incluya
  const opciones = elegida && lista && !lista.some((i) => i.id === elegida.id) ? [elegida, ...lista] : lista ?? [];

  const elegirPlan = (id: number, monto: number) => setF({ ...f, tipo_suscripcion_id: String(id), monto_pactado: String(monto) });

  const crear = async () => {
    if (!elegida) return setError('Elige la instalación');
    if (!plan) return setError('Elige un plan');
    setError('');
    setGuardando(true);
    try {
      const s = await api<{ id: number; codigo: string; mantenciones: number }>('/admin/suscripciones', {
        method: 'POST', body: { ...f, instalacion_id: elegida.id },
      });
      navegar(`/admin/suscripciones/${s.id}`, { state: { aviso: `Se creó ${s.codigo}${s.mantenciones ? ` y se agendaron ${s.mantenciones} mantenciones` : ''}` } });
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <>
      <Volver a="/admin/suscripciones" texto="Suscripciones" />
      <h1 className="titulo-pagina">Inscribir suscripción manualmente</h1>
      <p className="nota-info"><span>Solo para casos especiales. Lo normal es que el cliente contrate desde su portal.</span></p>
      <div className="con-resumen">
        <div className="tarjeta asistente">
          <h2>Instalación</h2>
          <label className="buscador-icono">
            <Search size={18} />
            <input className="buscador" type="search" placeholder="Busca por código, instalación o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {cargando && !lista ? <Cargando /> : (
            <div className="opciones-tarjeta">
              {opciones.map((i) => (
                <button key={i.id} type="button" className={elegida?.id === i.id ? 'elegida' : ''} onClick={() => setElegida(i)}>
                  <strong>{i.nombre || i.direccion} · {i.codigo}</strong>
                  <small>{i.cliente} · {i.vigente_codigo ? `${i.vigente_codigo} vigente`
                    : i.ultima_hasta ? (diasDesde(i.ultima_hasta) < 0 ? `cancelada · cubierta hasta el ${fechaCorta(i.ultima_hasta)}` : `sin suscripción hace ${diasDesde(i.ultima_hasta)} días`) : 'nunca ha tenido suscripción'}</small>
                </button>
              ))}
              {opciones.length === 0 && <p className="suave">No hay instalaciones que coincidan.</p>}
            </div>
          )}

          {bloqueada && elegida ? (
            <div className="nota-alerta">
              <AlertTriangle size={20} />
              <span>{elegida.nombre || elegida.codigo} ya tiene la suscripción <strong>{elegida.vigente_codigo}</strong> vigente. No se puede inscribir otra.</span>
              <Link to={`/admin/suscripciones/${elegida.vigente_id}`} className="boton secundario mini">Ver suscripción</Link>
            </div>
          ) : (
            <>
              <h2>Plan</h2>
              <div className="opciones-tarjeta">
                {op?.planes.map((p) => (
                  <button key={p.id} type="button" className={f.tipo_suscripcion_id === String(p.id) ? 'elegida' : ''} onClick={() => elegirPlan(p.id, p.monto_clp)}>
                    <strong>{p.nombre}</strong>
                    <small>{pesos(p.monto_clp)} {FRECUENCIAS[p.frecuencia_pago]} · {p.mantenciones_por_anio} {p.mantenciones_por_anio === 1 ? 'mantención' : 'mantenciones'} al año</small>
                  </button>
                ))}
              </div>
              <div className="formulario dos">
                <Campo etiqueta="Fecha de inicio" type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} />
                <Campo etiqueta="Meses gratis" type="number" min="0" max="12" value={f.meses_gratis} onChange={(e) => setF({ ...f, meses_gratis: e.target.value })} />
                <Campo etiqueta={`Monto pactado ${plan ? FRECUENCIAS[plan.frecuencia_pago] : ''}`} type="number" min="0" value={f.monto_pactado}
                  onChange={(e) => setF({ ...f, monto_pactado: e.target.value })} ayuda={plan && Number(f.monto_pactado) !== plan.monto_clp ? `Precio del plan: ${pesos(plan.monto_clp)}` : undefined} />
              </div>
              <label className="check">
                <input type="checkbox" checked={f.acepto_condiciones} onChange={(e) => setF({ ...f, acepto_condiciones: e.target.checked })} />
                <span>El cliente aceptó las condiciones del servicio{op?.condiciones ? ` (versión ${op.condiciones.version})` : ''}. Si no, las acepta desde el portal.</span>
              </label>
            </>
          )}
        </div>

        <aside className="tarjeta resumen">
          <h2>Resumen</h2>
          <dl className="datos lineas">
            <div><dt>Instalación</dt><dd>{elegida ? elegida.nombre || elegida.codigo : '—'}</dd></div>
            <div><dt>Plan</dt><dd>{plan?.nombre ?? '—'}</dd></div>
            <div><dt>Monto</dt><dd>{f.monto_pactado ? `${pesos(f.monto_pactado)} ${plan ? FRECUENCIAS[plan.frecuencia_pago] : ''}` : '—'}</dd></div>
            <div><dt>Vigencia</dt><dd>{plan ? `${fechaCorta(inicio)} → ${fechaCorta(sumarMeses(inicio, plan.duracion_meses))}` : '—'}</dd></div>
            <div><dt>Primer cobro</dt><dd>{mes(sumarMeses(inicio, meses))}{meses > 0 ? ` (${meses} ${meses === 1 ? 'mes gratis' : 'meses gratis'})` : ''}</dd></div>
          </dl>
          {fechas.length > 0 && (
            <>
              <h3>Se agendarán solas</h3>
              <div className="chips">{fechas.map((x) => <span key={x} className="etiqueta alerta">Preventiva · {mes(x).replace(/^(\w{3})\w*/, '$1')}</span>)}</div>
            </>
          )}
          <Aviso>{error}</Aviso>
          <button type="button" className="boton primario" disabled={guardando || bloqueada || !elegida || !plan} onClick={crear}>
            {guardando ? 'Inscribiendo…' : 'Inscribir suscripción'}
          </button>
        </aside>
      </div>
    </>
  );
}
