// T-35 · Reportes: tablero del negocio con conclusiones en frases simples y gráficos
// (pagado vs. esperado, planes nuevos y cancelados, medios de pago, cobros con tarjeta,
// opinión de los clientes, mantenciones, técnicos, instalaciones sin plan y motivos de cancelación).
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CreditCard, Lightbulb, Tag, Wrench, Zap } from 'lucide-react';
import { useDatos } from '../../../useDatos';
import { Aviso, Cargando, Titulo, Vacio } from '../../../componentes';
import { MEDIOS, fechaCorta, iniciales, pesos } from '../../../formato';
import { whatsapp } from '../seguimiento/Seguimiento';

interface Mes { mes: string; esperado: number; pagado: number; altas: number; bajas: number; a_tiempo: number; tarde: number }
interface Datos {
  periodo: string; desde: string; meses: Mes[];
  resumen: { ingreso_mensual: number; ingreso_inicio: number; activos: number; esperado: number; pagado: number; altas: number; bajas: number; retencion: number | null; nota: number | null; opiniones: number };
  medios: { medio: string; n: number; monto: number }[];
  tarjeta: Partial<Record<'primer' | 'reintento' | 'en_proceso' | 'fallido', number>>;
  calificaciones: { nota: number; n: number }[];
  tecnicos: { id: number; nombre: string; visitas: number; tarde: number; sin_informe: number; nota: number | null }[];
  emergencias: { n: number; horas: number | null };
  sin_plan: { instalacion_id: number; instalacion: string; cliente_id: number; cliente: string; telefono: string | null; situacion: string; motivo: string | null; ultima_fecha_fin: string | null; potencia_kwp: string | null }[];
  plan_base: { nombre: string; mensual: number } | null;
  motivos: { motivo: string; n: number }[];
}

// Colores de los gráficos (validados para daltonismo y contraste): azul, ocre, verde agua
const S1 = '#3f64a3', S2 = '#c9822a', S3 = '#1f9677', FANTASMA = '#e4e2dc', REJILLA = '#eeece6', TINTA = '#6e6e73';
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaMes = (m: string) => MES_CORTO[Number(m.slice(5, 7)) - 1];
const mesLargo = (m: string) => `${etiquetaMes(m)} ${m.slice(0, 4)}`;
const PERIODOS = [['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses'], ['todo', 'Desde el inicio']] as const;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// Tooltip que sigue al mouse
type Tip = { x: number; y: number; contenido: ReactNode } | null;
type Mostrar = (e: MouseEvent, contenido: ReactNode) => void;

export default function Reportes() {
  const [periodo, setPeriodo] = useState('6');
  const { datos: d, error, cargando } = useDatos<Datos>(`/admin/reportes?periodo=${periodo}`);
  const [tip, setTip] = useState<Tip>(null);
  const mostrar: Mostrar = (e, contenido) => setTip({ x: e.clientX, y: e.clientY, contenido });
  const ocultar = () => setTip(null);

  return (
    <>
      <Titulo icono={BarChart3} fuerte="Reportes" suave="Cómo va el negocio de mantenciones" />
      <div className="filtros-reporte">
        <div className="segmentos" role="group" aria-label="Periodo">
          {PERIODOS.map(([v, t]) => <button key={v} type="button" className={periodo === v ? 'activo' : ''} onClick={() => setPeriodo(v)}>{t}</button>)}
        </div>
        {d && <span className="suave">Desde {fechaCorta(d.desde)}</span>}
      </div>
      {cargando && !d ? <Cargando /> : !d ? <Aviso>{error}</Aviso> : (
        <div className="reportes" onMouseLeave={ocultar}>
          <Hallazgos d={d} />
          <Resumen d={d} />
          <div className="rep-g2">
            <Caja titulo="Pagado vs. esperado" sub="Lo que se pagó de cada mes y lo que debía pagarse"
              pie={<Datos2 d={d} />}><GrafIngresos meses={d.meses} mostrar={mostrar} ocultar={ocultar} /></Caja>
            <Caja titulo="Planes nuevos y cancelados" sub={`Hoy hay ${d.resumen.activos} ${d.resumen.activos === 1 ? 'plan activo' : 'planes activos'}`}>
              <GrafAltasBajas meses={d.meses} mostrar={mostrar} ocultar={ocultar} /></Caja>
          </div>
          <div className="rep-g3">
            <MediosPago d={d} mostrar={mostrar} ocultar={ocultar} />
            <CobrosTarjeta d={d} mostrar={mostrar} ocultar={ocultar} />
            <Opinion d={d} mostrar={mostrar} ocultar={ocultar} />
          </div>
          <div className="rep-g2">
            <Caja titulo="Mantenciones" sub={resumenMantenciones(d.meses)}><GrafMantenciones meses={d.meses} mostrar={mostrar} ocultar={ocultar} /></Caja>
            <Tecnicos d={d} />
          </div>
          <div className="rep-g2">
            <SinPlan d={d} />
            <Caja titulo="Por qué cancelan" sub={d.motivos.length ? `${d.resumen.bajas} ${d.resumen.bajas === 1 ? 'cancelación' : 'cancelaciones'} en el periodo` : 'Sin cancelaciones en el periodo'}>
              {d.motivos.length
                ? <HBarras filas={d.motivos.map((m) => ({ t: m.motivo, n: m.n }))} color={S2} total={d.motivos.reduce((a, m) => a + m.n, 0)} mostrar={mostrar} ocultar={ocultar} />
                : <p className="suave">Ningún plan se cerró en este periodo.</p>}
            </Caja>
          </div>
        </div>
      )}
      {tip && <div className="tip-grafico" style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: tip.y + 14 }}>{tip.contenido}</div>}
    </>
  );
}

function Caja({ titulo, sub, children, pie }: { titulo: string; sub?: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <section className="tarjeta rep-caja">
      <header><h2>{titulo}</h2>{sub && <small className="suave">{sub}</small>}</header>
      {children}
      {pie}
    </section>
  );
}

// ---------- Conclusiones ----------
function Hallazgos({ d }: { d: Datos }) {
  const lista: { icono: ReactNode; titulo: string; texto: string }[] = [];
  const n = d.sin_plan.length;
  if (n > 0 && d.plan_base) {
    const extra = n * d.plan_base.mensual;
    lista.push({ icono: <Tag size={18} />, titulo: `Puedes ganar ${pesos(extra)} más al mes`,
      texto: `${n} ${n === 1 ? 'instalación no tiene' : 'instalaciones no tienen'} plan. Si contratan el ${d.plan_base.nombre}, el ingreso mensual pasa de ${pesos(d.resumen.ingreso_mensual)} a ${pesos(d.resumen.ingreso_mensual + extra)}.` });
  }
  const faltante = d.resumen.esperado - d.resumen.pagado;
  if (faltante > 0) lista.push({ icono: <CreditCard size={18} />, titulo: `Quedaron ${pesos(faltante)} sin pagar`, texto: `Se pagó el ${pct(d.resumen.pagado, d.resumen.esperado)} % de lo esperado en el periodo. Los planes que no pagan se cierran solos al terminar el plazo.` });
  const t = d.tarjeta, totalT = (t.primer ?? 0) + (t.reintento ?? 0) + (t.fallido ?? 0);
  if (totalT > 0) lista.push({ icono: <CreditCard size={18} />, titulo: 'Cobros con tarjeta', texto: `${t.primer ?? 0} de cada ${totalT} cobros salen al primer intento.` });
  else {
    const top = d.medios[0];
    if (top) lista.push({ icono: <CreditCard size={18} />, titulo: `El medio más usado es ${(MEDIOS[top.medio] ?? top.medio).toLowerCase()}`, texto: 'Invitar a los clientes a inscribir su tarjeta evita esperar sus pagos cada mes.' });
  }
  const atrasado = [...d.tecnicos].sort((a, b) => (b.tarde + b.sin_informe) - (a.tarde + a.sin_informe))[0];
  if (atrasado && atrasado.tarde + atrasado.sin_informe > 0) {
    const partes = [atrasado.sin_informe ? `${atrasado.sin_informe} ${atrasado.sin_informe === 1 ? 'visita pasada sin informe' : 'visitas pasadas sin informe'}` : '', atrasado.tarde ? `${atrasado.tarde} cerrada${atrasado.tarde === 1 ? '' : 's'} tarde` : ''].filter(Boolean);
    lista.push({ icono: <Wrench size={18} />, titulo: `${atrasado.nombre} tiene visitas atrasadas`, texto: `${partes.join(' y ')}.` });
  }
  if (!lista.length) return null;
  return (
    <div className="hallazgos">
      <h2 className="subtitulo"><Lightbulb size={15} /> Lo que dicen los números</h2>
      <div className="rep-g3">{lista.slice(0, 3).map((h) => (
        <div key={h.titulo} className="hallazgo"><span className="hallazgo-icono">{h.icono}</span><div><strong>{h.titulo}</strong><small>{h.texto}</small></div></div>
      ))}</div>
    </div>
  );
}

function Resumen({ d }: { d: Datos }) {
  const r = d.resumen, dif = r.ingreso_mensual - r.ingreso_inicio;
  return (
    <div className="rep-g4">
      <div className="kpi rep-kpi"><span className="kpi-titulo">Ingreso mensual fijo</span><span className="kpi-valor">{pesos(r.ingreso_mensual)}</span>
        <small className={dif > 0 ? 'texto-bueno' : 'suave'}>{dif === 0 ? 'Igual que al inicio del periodo' : `${dif > 0 ? '▲' : '▼'} ${pesos(Math.abs(dif))} desde ${etiquetaMes(d.meses[0].mes).toLowerCase()}`}</small></div>
      <div className="kpi rep-kpi"><span className="kpi-titulo">Pagado en el periodo</span><span className="kpi-valor">{pesos(r.pagado)}</span>
        <small className="suave">{pct(r.pagado, r.esperado)} % de lo esperado</small></div>
      <div className="kpi rep-kpi"><span className="kpi-titulo">Clientes que se quedan</span><span className="kpi-valor">{r.retencion === null ? '—' : `${r.retencion} %`}</span>
        <small className="suave">{r.altas} {r.altas === 1 ? 'plan nuevo' : 'planes nuevos'} · {r.bajas} {r.bajas === 1 ? 'cancelado' : 'cancelados'}</small></div>
      <div className="kpi rep-kpi"><span className="kpi-titulo">Nota de los clientes</span><span className="kpi-valor">{r.nota === null ? '—' : r.nota.toLocaleString('es-CL')}</span>
        <small className="suave">{r.opiniones ? `de 5 · ${r.opiniones} ${r.opiniones === 1 ? 'opinión' : 'opiniones'}` : 'Aún sin opiniones'}</small></div>
    </div>
  );
}

// ---------- Gráficos ----------
type PropsG = { meses: Mes[]; mostrar: Mostrar; ocultar: () => void };
const redondeo = (v: number) => { const paso = v <= 4 ? 1 : v <= 8 ? 2 : v <= 100 ? 10 : v <= 100000 ? 20000 : 50000; return Math.max(paso, Math.ceil(v / paso) * paso); };
// Barra con las esquinas de arriba redondeadas, apoyada en la base
const barra = (x: number, base: number, w: number, h: number, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${base} V${base - h + rr} q0 -${rr} ${rr} -${rr} h${w - 2 * rr} q${rr} 0 ${rr} ${rr} V${base} Z`;
};
const barraAbajo = (x: number, base: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${base} V${base + h - rr} q0 ${rr} ${rr} ${rr} h${w - 2 * rr} q${rr} 0 ${rr} -${rr} V${base} Z`;
};
const Leyenda = ({ items }: { items: [string, string][] }) => (
  <div className="leyenda">{items.map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>
);

function EjeX({ meses, alto, paso }: { meses: Mes[]; alto: number; paso: number }) {
  const cada = meses.length > 12 ? Math.ceil(meses.length / 12) : 1;
  return <>{meses.map((m, k) => k % cada === 0 && <text key={m.mes} x={k * paso + paso / 2} y={alto + 18} textAnchor="middle" fontSize="11.5" fill={TINTA}>{etiquetaMes(m.mes)}</text>)}</>;
}
function EjeY({ max, alto, ancho, fmt }: { max: number; alto: number; ancho: number; fmt: (n: number) => string }) {
  // Con pocos datos (conteos chicos) las marcas van de 1 en 1 o de 2 en 2, sin decimales
  const ticks = max <= 8 ? Array.from({ length: max / (max <= 4 ? 1 : 2) + 1 }, (_, k) => k * (max <= 4 ? 1 : 2)) : [0, max / 4, max / 2, (max * 3) / 4, max];
  return <>{ticks.map((t) => { const y = alto - (t / max) * alto; return <g key={t}><line x1={0} x2={ancho} y1={y} y2={y} stroke={REJILLA} /><text x={-8} y={y + 4} textAnchor="end" fontSize="11" fill={TINTA}>{fmt(t)}</text></g>; })}</>;
}

function GrafIngresos({ meses, mostrar, ocultar }: PropsG) {
  const max = redondeo(Math.max(...meses.map((m) => Math.max(m.esperado, m.pagado)), 1));
  const alto = 170, ancho = 420, paso = ancho / meses.length, w = Math.min(paso * 0.55, 40);
  const miles = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  return (
    <>
      <svg viewBox={`-48 -12 ${ancho + 56} ${alto + 34}`} width="100%" role="img" aria-label="Pagado y esperado por mes">
        <EjeY max={max} alto={alto} ancho={ancho} fmt={miles} />
        {meses.map((m, k) => {
          const x = k * paso + (paso - w) / 2, he = (m.esperado / max) * alto, hp = (m.pagado / max) * alto, falta = m.esperado - m.pagado;
          return (
            <g key={m.mes} className="hov" onMouseMove={(e) => mostrar(e, <><b>{mesLargo(m.mes)}</b><br />Pagado {pesos(m.pagado)}<br />Esperado {pesos(m.esperado)}{falta > 0 && <><br />Faltó {pesos(falta)}</>}</>)} onMouseLeave={ocultar}>
              <rect x={k * paso} y={0} width={paso} height={alto} fill="transparent" />
              <path d={barra(x, alto, w, he)} fill={FANTASMA} />
              <path d={barra(x + w * 0.18, alto, w * 0.64, hp)} fill={S1} />
            </g>
          );
        })}
        <EjeX meses={meses} alto={alto} paso={paso} />
      </svg>
      <Leyenda items={[['Pagado', S1], ['Esperado', FANTASMA]]} />
    </>
  );
}

function GrafAltasBajas({ meses, mostrar, ocultar }: PropsG) {
  const max = Math.max(...meses.map((m) => Math.max(m.altas, m.bajas)), 1);
  const alto = 170, ancho = 420, paso = ancho / meses.length, w = Math.min(paso * 0.45, 34), cero = alto * 0.6, u = (cero - 18) / max;
  return (
    <>
      <svg viewBox={`-10 -6 ${ancho + 20} ${alto + 28}`} width="100%" role="img" aria-label="Planes nuevos y cancelados por mes">
        <line x1={0} x2={ancho} y1={cero} y2={cero} stroke="#c9c6bd" />
        {meses.map((m, k) => {
          const x = k * paso + (paso - w) / 2, ha = m.altas * u, hb = m.bajas * u;
          return (
            <g key={m.mes} className="hov" onMouseMove={(e) => mostrar(e, <><b>{mesLargo(m.mes)}</b><br />Planes nuevos: {m.altas}<br />Cancelados: {m.bajas}</>)} onMouseLeave={ocultar}>
              <rect x={k * paso} y={0} width={paso} height={alto} fill="transparent" />
              {m.altas > 0 && <><path d={barra(x, cero - 1, w, ha)} fill={S1} /><text x={x + w / 2} y={cero - ha - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1d1d1f">+{m.altas}</text></>}
              {m.bajas > 0 && <><path d={barraAbajo(x, cero + 1, w, hb)} fill={S2} /><text x={x + w / 2} y={cero + hb + 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1d1d1f">−{m.bajas}</text></>}
            </g>
          );
        })}
        <EjeX meses={meses} alto={alto - 8} paso={paso} />
      </svg>
      <Leyenda items={[['Planes nuevos', S1], ['Cancelados', S2]]} />
    </>
  );
}

function GrafMantenciones({ meses, mostrar, ocultar }: PropsG) {
  const max = redondeo(Math.max(...meses.map((m) => m.a_tiempo + m.tarde), 1));
  const alto = 150, ancho = 420, paso = ancho / meses.length, w = Math.min(paso * 0.45, 34), u = alto / max;
  return (
    <>
      <svg viewBox={`-32 -12 ${ancho + 40} ${alto + 34}`} width="100%" role="img" aria-label="Mantenciones a tiempo y cerradas tarde por mes">
        <EjeY max={max} alto={alto} ancho={ancho} fmt={(n) => String(Math.round(n * 10) / 10)} />
        {meses.map((m, k) => {
          const x = k * paso + (paso - w) / 2, h1 = m.a_tiempo * u, h2 = m.tarde * u;
          return (
            <g key={m.mes} className="hov" onMouseMove={(e) => mostrar(e, <><b>{mesLargo(m.mes)}</b><br />A tiempo: {m.a_tiempo}<br />Cerradas tarde: {m.tarde}</>)} onMouseLeave={ocultar}>
              <rect x={k * paso} y={0} width={paso} height={alto} fill="transparent" />
              {m.tarde > 0
                ? <><rect x={x} y={alto - h1} width={w} height={h1} fill={S1} /><path d={barra(x, alto - h1 - 2, w, h2 - 2)} fill={S2} /></>
                : <path d={barra(x, alto, w, h1)} fill={S1} />}
            </g>
          );
        })}
        <EjeX meses={meses} alto={alto} paso={paso} />
      </svg>
      <Leyenda items={[['A tiempo', S1], ['Cerradas tarde', S2]]} />
    </>
  );
}
const resumenMantenciones = (meses: Mes[]) => {
  const hechas = meses.reduce((a, m) => a + m.a_tiempo + m.tarde, 0), tarde = meses.reduce((a, m) => a + m.tarde, 0);
  return hechas ? `${hechas} ${hechas === 1 ? 'hecha' : 'hechas'} · ${tarde} ${tarde === 1 ? 'cerrada' : 'cerradas'} tarde (${pct(tarde, hechas)} %)` : 'Sin mantenciones hechas en el periodo';
};

function HBarras({ filas, color, total, mostrar, ocultar }: { filas: { t: string; n: number; extra?: string }[]; color: string; total: number; mostrar: Mostrar; ocultar: () => void }) {
  const max = Math.max(...filas.map((f) => f.n), 1);
  return (
    <div className="hbarras">
      {filas.map((f) => (
        <div key={f.t} className="hb" onMouseMove={(e) => mostrar(e, <><b>{f.t}</b><br />{f.n} ({pct(f.n, total)} %){f.extra && <><br />{f.extra}</>}</>)} onMouseLeave={ocultar}>
          <span title={f.t}>{f.t}</span>
          <div className="pista"><i style={{ width: `${(f.n / max) * 100}%`, background: color }} /></div>
          <b>{f.n} · {pct(f.n, total)} %</b>
        </div>
      ))}
    </div>
  );
}

function MediosPago({ d, mostrar, ocultar }: { d: Datos; mostrar: Mostrar; ocultar: () => void }) {
  const total = d.medios.reduce((a, m) => a + m.n, 0);
  return (
    <Caja titulo="Cómo pagan" sub={`${total} ${total === 1 ? 'pago' : 'pagos'} en el periodo`}>
      {total ? <HBarras filas={d.medios.map((m) => ({ t: MEDIOS[m.medio] ?? m.medio, n: m.n, extra: pesos(m.monto) }))} color={S1} total={total} mostrar={mostrar} ocultar={ocultar} />
        : <p className="suave">Aún no hay pagos en este periodo.</p>}
    </Caja>
  );
}

function CobrosTarjeta({ d, mostrar, ocultar }: { d: Datos; mostrar: Mostrar; ocultar: () => void }) {
  const partes: [string, number, string][] = ([['Al primer intento', d.tarjeta.primer ?? 0, S1], ['Con reintento', d.tarjeta.reintento ?? 0, S3], ['No se pudo cobrar', d.tarjeta.fallido ?? 0, S2]] as [string, number, string][]).filter((p) => p[1] > 0);
  const total = partes.reduce((a, p) => a + p[1], 0);
  return (
    <Caja titulo="Cobros con tarjeta" sub={total ? `${total} ${total === 1 ? 'mes cobrado' : 'meses cobrados'} con tarjeta` : 'Cobro automático cada mes'}>
      {total ? (
        <>
          <div className="apilada">{partes.map(([t, v, c]) => <i key={t} style={{ flex: v, background: c }} onMouseMove={(e) => mostrar(e, <><b>{t}</b><br />{v} de {total} ({pct(v, total)} %)</>)} onMouseLeave={ocultar} />)}</div>
          <Leyenda items={partes.map(([t, v, c]) => [`${t} · ${pct(v, total)} %`, c])} />
        </>
      ) : <p className="suave">Todavía no hay cobros automáticos con tarjeta en este periodo.</p>}
      {(d.tarjeta.en_proceso ?? 0) > 0 && <small className="suave">{d.tarjeta.en_proceso} en proceso.</small>}
    </Caja>
  );
}

function Opinion({ d, mostrar, ocultar }: { d: Datos; mostrar: Mostrar; ocultar: () => void }) {
  const total = d.calificaciones.reduce((a, c) => a + c.n, 0);
  return (
    <Caja titulo="Opinión de los clientes" sub={d.resumen.nota === null ? 'Aún sin opiniones' : `Promedio ${d.resumen.nota.toLocaleString('es-CL')} de 5`}>
      {total ? <HBarras filas={d.calificaciones.map((c) => ({ t: '★'.repeat(c.nota), n: c.n }))} color={S1} total={total} mostrar={mostrar} ocultar={ocultar} />
        : <p className="suave">Los clientes califican cada visita desde su portal.</p>}
    </Caja>
  );
}

function Tecnicos({ d }: { d: Datos }) {
  const e = d.emergencias;
  return (
    <Caja titulo="Técnicos" sub="Visitas hechas en el periodo">
      {d.tecnicos.length === 0 ? <Vacio>No hay técnicos activos.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Técnico</th><th className="num">Visitas</th><th className="num" title="Informe enviado después de la fecha">Tarde</th><th className="num" title="Visitas pasadas sin informe">Sin informe</th><th className="num">Nota</th></tr></thead>
          <tbody>{d.tecnicos.map((t) => (
            <tr key={t.id}>
              <td><span className="quien"><span className="avatar chico">{iniciales(t.nombre)}</span>{t.nombre}</span></td>
              <td className="num">{t.visitas}</td><td className="num">{t.tarde}</td>
              <td className={`num ${t.sin_informe ? 'texto-malo' : ''}`}>{t.sin_informe}</td>
              <td className="num">{t.nota === null ? '—' : t.nota.toLocaleString('es-CL')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="hallazgo gris"><span className="hallazgo-icono"><Zap size={18} /></span>
        <div><strong>{e.n} {e.n === 1 ? 'emergencia' : 'emergencias'} en el periodo</strong>
          <small>{e.horas === null ? 'Sin tiempo de respuesta registrado.' : e.horas === 0 ? 'Se respondieron en menos de una hora en promedio.' : `Tiempo promedio de respuesta: ${e.horas} ${e.horas === 1 ? 'hora' : 'horas'}.`}</small></div></div>
    </Caja>
  );
}

function SinPlan({ d }: { d: Datos }) {
  const lista = d.sin_plan.slice(0, 6);
  return (
    <Caja titulo="Instalaciones sin plan" sub={d.sin_plan.length ? `${d.sin_plan.length} · conviene ofrecerles un plan` : 'Todas las instalaciones tienen plan'}
      pie={d.sin_plan.length > lista.length ? <Link to="/admin/seguimiento" className="enlace">Ver las {d.sin_plan.length} en Seguimiento ›</Link> : null}>
      {lista.length === 0 ? <p className="suave">No hay instalaciones sin plan.</p> : (
        <ul className="rep-lista">{lista.map((i) => {
          const wa = whatsapp(i.telefono, `Hola ${i.cliente.split(' ')[0]}, te escribimos de ENINTI. ¿Te gustaría contratar un plan de mantención para ${i.instalacion}?`);
          return (
            <li key={i.instalacion_id}>
              <span className="avatar chico">{iniciales(i.cliente)}</span>
              <span className="rep-lista-texto"><Link to={`/admin/instalaciones/${i.instalacion_id}`}><strong>{i.instalacion}</strong></Link>
                <small>{i.cliente}{i.potencia_kwp ? ` · ${Number(i.potencia_kwp).toLocaleString('es-CL')} kWp` : ''} · {i.situacion === 'nunca suscrita' ? 'nunca tuvo plan' : `plan terminado${i.ultima_fecha_fin ? ` el ${fechaCorta(i.ultima_fecha_fin)}` : ''}`}</small></span>
              {wa ? <a href={wa} target="_blank" rel="noreferrer" className="boton secundario mini">Ofrecer plan</a> : <small className="suave">Sin teléfono</small>}
            </li>
          );
        })}</ul>
      )}
    </Caja>
  );
}

function Datos2({ d }: { d: Datos }) {
  return (
    <details className="rep-datos">
      <summary>Ver los números</summary>
      <div className="tabla"><table>
        <thead><tr><th>Mes</th><th className="num">Esperado</th><th className="num">Pagado</th><th className="num">Faltó</th></tr></thead>
        <tbody>{d.meses.map((m) => <tr key={m.mes}><td>{mesLargo(m.mes)}</td><td className="num">{pesos(m.esperado)}</td><td className="num">{pesos(m.pagado)}</td><td className="num">{pesos(Math.max(0, m.esperado - m.pagado))}</td></tr>)}</tbody>
      </table></div>
    </details>
  );
}
