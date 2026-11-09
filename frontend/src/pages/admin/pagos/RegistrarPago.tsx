// T-23 · Mockups 079 y 080: registrar un pago a mano (efectivo, transferencia directa, depósito o
// tarjeta presencial) o generar un enlace de pago de Flow para mandarlo por WhatsApp o correo.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, CreditCard, Link2, Search } from 'lucide-react';
import { api } from '../../../api';
import { useDatos } from '../../../useDatos';
import { Aviso, Campo, Cargando, Volver } from '../../../componentes';
import { FRECUENCIAS, hoyISO, mes, pesos } from '../../../formato';
import type { FilaSuscripcion } from '../suscripciones/Suscripciones';

interface Datos {
  id: number; codigo: string; estado: string; tipo_nombre: string; monto_pactado: number; frecuencia_pago: string; pagado_hasta: string | null;
  periodos_adeudados: number; monto_adeudado: number; cliente_id: number; cliente_nombre: string; instalacion_nombre: string | null;
  instalacion_codigo: string; ultima_gestion: string | null; tarjeta: string | null;
  periodos: { inicio: string; periodo: string; vencido: boolean }[];
}
const MEDIOS_MANUALES: [string, string][] = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['deposito', 'Depósito'], ['tarjeta', 'Tarjeta presencial']];
const mesLargo = (f: string) => mes(f).replace(/^(\w)/, (l) => l.toUpperCase());

export default function RegistrarPago() {
  const [params, setParams] = useSearchParams();
  const susId = params.get('suscripcion');
  const clienteId = params.get('cliente');
  if (!susId) return <ElegirSuscripcion clienteId={clienteId} elegir={(id) => setParams({ suscripcion: String(id) })} />;
  return <Formulario key={susId} susId={susId} otro={() => setParams({})} />;
}

function ElegirSuscripcion({ clienteId, elegir }: { clienteId: string | null; elegir: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusqueda(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const p = new URLSearchParams({ estado: 'vigente' });
  if (busqueda) p.set('q', busqueda);
  if (clienteId) p.set('cliente', clienteId);
  const { datos, cargando } = useDatos<{ suscripciones: FilaSuscripcion[] }>(`/admin/suscripciones?${p}`);
  useEffect(() => { if (clienteId && datos?.suscripciones.length === 1) elegir(datos.suscripciones[0].id); }, [clienteId, datos, elegir]);
  return (
    <>
      <Volver a="/admin/pagos" texto="Pagos" />
      <h1 className="titulo-pagina">Registrar pago</h1>
      <div className="tarjeta asistente">
        <label className="buscador-icono"><Search size={18} />
          <input className="buscador" type="search" placeholder="Cliente, código o instalación" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
        {cargando && !datos ? <Cargando /> : (
          <div className="opciones-tarjeta">
            {datos?.suscripciones.map((s) => (
              <button key={s.id} type="button" onClick={() => elegir(s.id)}>
                <strong>{s.codigo} · {s.cliente_nombre}</strong>
                <small>{s.instalacion_nombre || s.direccion} · {s.periodos_adeudados > 0 ? 'pago pendiente' : 'al día'}</small>
              </button>
            ))}
            {datos?.suscripciones.length === 0 && <p className="suave">No hay suscripciones vigentes que coincidan.</p>}
          </div>
        )}
      </div>
    </>
  );
}

function Formulario({ susId, otro }: { susId: string; otro: () => void }) {
  const { datos: d, error } = useDatos<Datos>(`/admin/pagos/registrar/${susId}`);
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  const [f, setF] = useState({ monto_periodo: '', fecha_pago: hoyISO(), medio_pago: 'efectivo', referencia: '', observaciones: '' });
  const [falla, setFalla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ total: number; n: number } | null>(null);
  const [enlace, setEnlace] = useState<{ url: string; monto: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Sugerido: los periodos vencidos (o el próximo si está al día)
  useEffect(() => {
    if (!d || elegidos) return;
    const vencidos = d.periodos.filter((p) => p.vencido).map((p) => p.periodo);
    setElegidos(vencidos.length ? vencidos : d.periodos.slice(0, 1).map((p) => p.periodo));
    setF((x) => ({ ...x, monto_periodo: String(d.monto_pactado) }));
  }, [d, elegidos]);

  if (!d) return <><Volver a="/admin/pagos" texto="Pagos" />{error ? <Aviso>{error}</Aviso> : <Cargando />}</>;
  const sel = elegidos ?? [];
  // Los periodos se pagan en orden: elegir uno marca también los anteriores
  const alternar = (periodo: string) => {
    const k = d.periodos.findIndex((p) => p.periodo === periodo);
    const marcado = sel.includes(periodo);
    setElegidos(d.periodos.slice(0, marcado ? k : k + 1).map((p) => p.periodo));
  };
  const total = (Number(f.monto_periodo) || 0) * sel.length;

  const registrar = async () => {
    setFalla('');
    if (!sel.length) return setFalla('Elige al menos un periodo');
    setGuardando(true);
    try {
      const r = await api<{ total: number; ids: number[] }>('/admin/pagos', { method: 'POST', body: { ...f, suscripcion_id: d.id, periodos: sel, monto_periodo: Number(f.monto_periodo) } });
      setListo({ total: r.total, n: r.ids.length });
    } catch (e) { setFalla((e as Error).message); } finally { setGuardando(false); }
  };
  const generarEnlace = async () => {
    setFalla('');
    setGuardando(true);
    try { setEnlace(await api<{ url: string; monto: number }>(`/admin/pagos/suscripcion/${d.id}/enlace`, { method: 'POST', body: { cantidad: Math.max(1, sel.length) } })); }
    catch (e) { setFalla((e as Error).message); } finally { setGuardando(false); }
  };
  const copiar = () => enlace && navigator.clipboard.writeText(enlace.url).then(() => setCopiado(true));
  const whatsapp = enlace && `https://wa.me/?text=${encodeURIComponent(`Hola, te dejo el enlace para pagar tu suscripción de mantención ENINTI ${d.codigo} (${pesos(enlace.monto)}): ${enlace.url}`)}`;

  if (listo) return (
    <>
      <Volver a="/admin/pagos" texto="Pagos" />
      <div className="tarjeta asistente centrado">
        <span className="icono-circulo chico"><Check size={30} /></span>
        <h2>Pago registrado</h2>
        <p className="suave">{pesos(listo.total)} de {d.cliente_nombre} · {listo.n} {listo.n === 1 ? 'periodo' : 'periodos'} de {d.codigo}. Quedó como "Pagado" al instante.</p>
        <div className="acciones centro">
          <button type="button" className="boton secundario chico" onClick={otro}>Registrar otro</button>
          <Link to={`/admin/suscripciones/${d.id}`} className="boton secundario chico">Ver suscripción</Link>
          <Link to="/admin/pagos" className="boton primario chico">Ir a Pagos</Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Volver a="/admin/pagos" texto="Pagos" />
      <h1 className="titulo-pagina">Registrar pago</h1>
      <div className="con-resumen">
        <div className="tarjeta asistente">
          <div className="fila-suscripcion">
            <span><strong>{d.codigo} · {d.cliente_nombre}</strong><small>{d.instalacion_nombre || d.instalacion_codigo} · {d.tipo_nombre}</small></span>
            <button type="button" className="boton suave mini" onClick={otro}>Cambiar</button>
          </div>
          <h2>Periodo</h2>
          {d.periodos.length === 0 ? <p className="suave">Esta suscripción no tiene periodos por pagar.</p> : (
            <div className="chips grandes">
              {d.periodos.map((p, k) => (
                <button key={p.periodo} type="button" className={`chip ${sel.includes(p.periodo) ? 'elegido' : ''}`} onClick={() => alternar(p.periodo)}>
                  {mesLargo(p.periodo)}{k === 0 ? ' · sugerido' : ''}{p.vencido ? '' : ' · adelanto'}
                </button>
              ))}
            </div>
          )}
          <div className="formulario dos">
            <Campo etiqueta={`Monto por periodo (plan: ${pesos(d.monto_pactado)} ${FRECUENCIAS[d.frecuencia_pago]})`} type="number" min="1" value={f.monto_periodo}
              onChange={(e) => setF({ ...f, monto_periodo: e.target.value })} ayuda={sel.length > 1 ? `Total: ${pesos(total)}` : undefined} />
            <Campo etiqueta="Fecha de pago" type="date" max={hoyISO()} value={f.fecha_pago} onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} />
          </div>
          <h2>Medio de pago</h2>
          <div className="segmentos">
            {MEDIOS_MANUALES.map(([v, t]) => (
              <button key={v} type="button" className={f.medio_pago === v ? 'activo' : ''} onClick={() => setF({ ...f, medio_pago: v })}>{t}</button>
            ))}
          </div>
          <div className="formulario dos">
            <Campo etiqueta={f.medio_pago === 'efectivo' ? 'N° de recibo (opcional)' : 'N° de operación (opcional)'} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
            <Campo etiqueta="Observaciones (opcional)" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
          </div>
          <Aviso>{falla}</Aviso>
          <div className="acciones">
            <button type="button" className="boton primario" disabled={guardando || !sel.length} onClick={registrar}>
              {guardando ? 'Guardando…' : `Registrar pago${total ? ` de ${pesos(total)}` : ''}`}</button>
          </div>
        </div>

        <aside className={`tarjeta resumen ${d.periodos_adeudados > 0 ? 'deuda' : ''}`}>
          <h2>{d.codigo}</h2>
          <p className="suave">{d.cliente_nombre} · {d.instalacion_nombre || d.instalacion_codigo} · {d.tipo_nombre}</p>
          <dl className="datos lineas">
            <div><dt>Pagado hasta</dt><dd>{d.pagado_hasta ? mesLargo(d.pagado_hasta) : 'Sin pagos'}</dd></div>
            <div><dt>Pendiente</dt><dd className={d.periodos_adeudados ? 'texto-malo' : ''}>{d.periodos_adeudados ? `${d.periodos_adeudados} ${d.periodos_adeudados === 1 ? 'periodo' : 'periodos'} · ${pesos(d.monto_adeudado)}` : 'Al día'}</dd></div>
            <div><dt>Última gestión</dt><dd>{d.ultima_gestion ?? '—'}</dd></div>
            <div><dt>Cobro automático</dt><dd>{d.tarjeta ? <><CreditCard size={14} /> {d.tarjeta}</> : 'Sin tarjeta inscrita'}</dd></div>
          </dl>
          <hr />
          <h3>¿Prefiere pagar en línea?</h3>
          <p className="suave">Mándale un enlace y paga desde su celular.</p>
          {enlace ? (
            <div className="enlace-generado">
              <code>{enlace.url}</code>
              <div className="acciones">
                <button type="button" className="boton secundario mini" onClick={copiar}><Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}</button>
                <a href={whatsapp!} target="_blank" rel="noreferrer" className="boton primario mini">Enviar por WhatsApp</a>
              </div>
            </div>
          ) : (
            <button type="button" className="boton secundario chico" disabled={guardando || !d.periodos.length} onClick={generarEnlace}><Link2 size={16} /> Generar enlace de pago</button>
          )}
        </aside>
      </div>
    </>
  );
}

