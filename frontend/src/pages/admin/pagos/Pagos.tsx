// T-23, T-25 y T-26 · Mockups 081 a 084: pagos del mes, cobros en línea (Flow), por validar,
// historial y tarjetas inscritas. Todo lo que cobra Flow aparece aquí sin entrar a Flow.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, CreditCard, Download, Plus, RefreshCw, Search, Zap } from 'lucide-react';
import { api, descargar } from '../../../api';
import { useDatos } from '../../../useDatos';
import { AreaTexto, Aviso, Campo, Cargando, Etiqueta, Modal, Pestanas, Titulo, Vacio, type Tono } from '../../../componentes';
import { MEDIOS, fechaCorta, hoyISO, mes, pesos } from '../../../formato';
import { ESTADO_PAGO } from '../../../estados';

type Vista = 'mes' | 'cobros' | 'validar' | 'historial' | 'tarjetas';
interface Resumen {
  mes: string; cobrado: number; pagos: number; en_linea: number; con_boleta: number; por_validar: number;
  fallidos: number; pendientes: number; tarjetas: number; morosos: number; deuda: number; automaticos: boolean;
  medios: { medio: string; pagos: number; monto: number }[];
}
export interface Pago {
  id: number; periodo: string; monto: number; fecha_pago: string | null; medio_pago: string; estado: string; referencia_externa: string | null;
  nro_boleta: string | null; observaciones: string | null; motivo_rechazo: string | null; motivo_anulacion: string | null; comprobante_path: string | null;
  cobro_id: number | null; created_at: string; suscripcion_id: number; suscripcion: string; cliente_id: number; cliente: string;
  instalacion: string | null; registrado_por: string | null; validado_por: string | null; cobro_canal: string | null;
}
interface ListaPagos { pagos: Pago[]; total: number; monto: number; pagina: number; por_pagina: number }
interface Cobro {
  id: number; periodo: string; cantidad_periodos: number; monto: number; canal: 'tarjeta' | 'enlace'; origen: string; estado: string; intento: number;
  commerce_order: string; url_pago: string | null; medio_flow: string | null; error: string | null; created_at: string;
  suscripcion_id: number; suscripcion: string; cliente_id: number; cliente: string;
}
interface Tarjeta { cliente_id: number; cliente: string; email: string | null; tipo: string | null; ultimos4: string | null; inscrita_at: string | null; vigentes: number; ultimo_rechazo: string | null }

export const ESTADO_COBRO: Record<string, [Tono, string]> = {
  pendiente: ['alerta', 'Esperando pago'], pagado: ['buena', 'Pagado'], rechazado: ['mala', 'Rechazado'], anulado: ['neutra', 'Anulado'], expirado: ['neutra', 'Expirado'],
};
const ORIGEN: Record<string, string> = { automatico: 'Automático', cliente: 'El cliente', admin: 'Administración' };
const mesCorto = (f: string) => mes(f).replace(/^(\w)/, (l) => l.toUpperCase());
const periodoTexto = (p: string, n = 1) => (n > 1 ? `${mesCorto(p)} + ${n - 1}` : mesCorto(p));

// Últimos 12 meses para el selector
function meses() {
  const hoy = new Date(`${hoyISO()}T12:00:00`);
  return Array.from({ length: 12 }, (_, k) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function MedioPago({ p }: { p: Pick<Pago, 'medio_pago' | 'cobro_id' | 'cobro_canal'> }) {
  return (
    <>{MEDIOS[p.medio_pago] ?? p.medio_pago}
      <small>{p.cobro_id ? (p.cobro_canal === 'tarjeta' ? 'Automático' : 'En línea') : 'Manual'}</small></>
  );
}

export default function Pagos() {
  const [params, setParams] = useSearchParams();
  const vista = (params.get('vista') as Vista) || 'mes';
  const [mesSel, setMesSel] = useState(meses()[0]);
  const { datos: r, recargar: recargarResumen, error: errorResumen } = useDatos<Resumen>(`/admin/pagos/resumen?mes=${mesSel}`);
  const [aviso, setAviso] = useState('');
  const [version, setVersion] = useState(0);
  const listo = useCallback((m: string) => { setAviso(m); recargarResumen(); setVersion((v) => v + 1); }, [recargarResumen]);
  const cambiar = (v: Vista) => setParams(v === 'mes' ? {} : { vista: v }, { replace: true });

  return (
    <>
      <div className="encabezado">
        <Titulo icono={CreditCard} fuerte="Pagos" />
        <div className="acciones">
          <Link to="/admin/pagos/registrar" className="boton primario chico"><Plus size={18} /> Registrar pago</Link>
        </div>
      </div>
      <Aviso>{errorResumen}</Aviso>
      <Aviso tipo="ok">{aviso}</Aviso>

      {r && (
        <div className="kpis">
          <div className="kpi destacada"><span className="kpi-titulo">Cobrado este mes</span><strong className="kpi-valor">{pesos(r.cobrado)}</strong>
            <span className="kpi-enlace">{r.pagos} pagos · {r.en_linea} en línea</span></div>
          <button type="button" className={`kpi ${r.fallidos ? 'mala' : ''}`} onClick={() => cambiar('cobros')}>
            <span className="kpi-titulo">{r.fallidos ? <i className="punto" /> : null}Cobros fallidos</span><strong className="kpi-valor">{r.fallidos}</strong>
            <span className="kpi-enlace">{r.pendientes} esperando pago ›</span></button>
          {r.por_validar > 0 && <button type="button" className="kpi alerta" onClick={() => cambiar('validar')}>
            <span className="kpi-titulo"><i className="punto" />Por validar</span><strong className="kpi-valor">{r.por_validar}</strong>
            <span className="kpi-enlace">Comprobantes ›</span></button>}
          <button type="button" className="kpi" onClick={() => cambiar('tarjetas')}>
            <span className="kpi-titulo">Tarjetas inscritas</span><strong className="kpi-valor">{r.tarjetas}</strong>
            <span className="kpi-enlace">{r.morosos} con pago pendiente ›</span></button>
        </div>
      )}
      {r && !r.automaticos && <p className="nota-info"><Zap size={16} /><span>Cobro automático apagado en este ambiente.</span></p>}

      <Pestanas<Vista> valor={vista} cambiar={cambiar} opciones={[
        ['mes', 'Pagos del mes'], ['cobros', 'Cobros en línea', r?.pendientes],
        ...(r?.por_validar || vista === 'validar' ? [['validar', 'Por validar', r?.por_validar] as [Vista, string, number?]] : []),
        ['historial', 'Historial'], ['tarjetas', 'Tarjetas', r?.tarjetas],
      ]} />

      {vista === 'mes' && <PagosDelMes mesSel={mesSel} setMesSel={setMesSel} resumen={r} version={version} listo={listo} />}
      {vista === 'cobros' && <Cobros version={version} listo={listo} />}
      {vista === 'validar' && <PorValidar version={version} listo={listo} />}
      {vista === 'historial' && <Historial version={version} listo={listo} />}
      {vista === 'tarjetas' && <Tarjetas />}
    </>
  );
}

// ---------- Pagos del mes (083) ----------
function PagosDelMes({ mesSel, setMesSel, resumen, version, listo }: { mesSel: string; setMesSel: (m: string) => void; resumen: Resumen | null; version: number; listo: (m: string) => void }) {
  const { datos, error, cargando } = useDatos<ListaPagos>(`/admin/pagos?mes=${mesSel}&v=${version}`);
  const [descargando, setDescargando] = useState(false);
  const excel = async () => {
    setDescargando(true);
    try { await descargar(`/admin/pagos/excel?mes=${mesSel}`, `pagos-${mesSel}.csv`); } catch (e) { window.alert((e as Error).message); } finally { setDescargando(false); }
  };
  return (
    <>
      <div className="filtros">
        <label className="selector-mes"><span>Mes</span>
          <select value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
            {meses().map((m) => <option key={m} value={m}>{mesCorto(`${m}-01`)}</option>)}
          </select>
        </label>
        {resumen && <span className="total-mes">Total cobrado <strong>{pesos(resumen.cobrado)}</strong> · {resumen.pagos} pagos · <span className="suave">{resumen.con_boleta} con boleta</span></span>}
        <button type="button" className="boton secundario chico empujar" disabled={descargando} onClick={excel}><Download size={18} /> Exportar a Excel</button>
      </div>
      {resumen && resumen.medios.length > 0 && (
        <div className="chips">{resumen.medios.map((m) => <span key={m.medio} className="etiqueta neutra">{MEDIOS[m.medio] ?? m.medio} · {m.pagos} · {pesos(m.monto)}</span>)}</div>
      )}
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.pagos.length === 0 ? <Vacio>No hay pagos en este mes.</Vacio> : (
        <TablaPagos pagos={datos.pagos} listo={listo} boleta />
      ))}
    </>
  );
}

// Tabla de pagos con boleta y anulación
function TablaPagos({ pagos, listo, boleta }: { pagos: Pago[]; listo: (m: string) => void; boleta?: boolean }) {
  const navegar = useNavigate();
  const [accion, setAccion] = useState<{ tipo: 'boleta' | 'anular'; p: Pago } | null>(null);
  return (
    <>
      <div className="tabla"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Mes</th><th>Medio</th><th className="num">Monto</th><th>{boleta ? 'Boleta' : 'Estado'}</th><th /></tr></thead>
        <tbody>{pagos.map((p) => (
          <tr key={p.id} className={p.estado === 'anulado' ? 'retirado' : ''}>
            <td>{p.fecha_pago ? fechaCorta(p.fecha_pago) : fechaCorta(p.created_at)}</td>
            <td><Link to={`/admin/clientes/${p.cliente_id}`}>{p.cliente}</Link>{p.instalacion && <small>{p.instalacion}</small>}</td>
            <td>{mesCorto(p.periodo)}</td>
            <td><MedioPago p={p} /></td>
            <td className="num">{pesos(p.monto)}</td>
            <td>{boleta && p.estado === 'pagado'
              ? (p.nro_boleta ? <Etiqueta tono="buena">{p.nro_boleta}</Etiqueta>
                : <button type="button" className="boton secundario mini" onClick={() => setAccion({ tipo: 'boleta', p })}>Agregar boleta</button>)
              : <><Etiqueta tono={ESTADO_PAGO[p.estado][0]}>{ESTADO_PAGO[p.estado][1]}</Etiqueta>
                {(p.motivo_anulacion || p.motivo_rechazo) && <small>{p.motivo_anulacion || p.motivo_rechazo}</small>}</>}</td>
            <td>{p.estado === 'pagado' && <button type="button" className="boton peligro mini" onClick={() => setAccion({ tipo: 'anular', p })}>Anular</button>}
              {p.estado !== 'pagado' && <button type="button" className="boton secundario mini" onClick={() => navegar(`/admin/suscripciones/${p.suscripcion_id}`)}>Ver</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {accion?.tipo === 'boleta' && (
        <PedirTexto titulo={`Boleta del pago de ${accion.p.cliente}`} etiqueta="N° de boleta" boton="Guardar"
          cerrar={() => setAccion(null)} enviar={async (t) => { await api(`/admin/pagos/${accion.p.id}/boleta`, { method: 'POST', body: { nro_boleta: t } }); setAccion(null); listo('Boleta registrada'); }} />
      )}
      {accion?.tipo === 'anular' && (
        <PedirTexto titulo={`Anular pago de ${pesos(accion.p.monto)}`} etiqueta="Motivo de la anulación" boton="Anular pago" peligro largo
          nota={`${accion.p.cliente} · ${accion.p.suscripcion} · ${mesCorto(accion.p.periodo)}. El pago no se borra: queda anulado y el periodo vuelve a quedar por pagar.${accion.p.cobro_id ? ' Si el dinero ya se cobró por Flow, haz el reembolso en Flow.' : ''}`}
          cerrar={() => setAccion(null)} enviar={async (t) => { await api(`/admin/pagos/${accion.p.id}/anular`, { method: 'POST', body: { motivo: t } }); setAccion(null); listo('Pago anulado'); }} />
      )}
    </>
  );
}

// Modal con un solo campo de texto (boleta, motivo de anulación o rechazo)
export function PedirTexto({ titulo, etiqueta, boton, nota, peligro, largo, cerrar, enviar }: {
  titulo: string; etiqueta: string; boton: string; nota?: string; peligro?: boolean; largo?: boolean; cerrar: () => void; enviar: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const mandar = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return setError(`Completa: ${etiqueta.toLowerCase()}`);
    setGuardando(true);
    try { await enviar(texto.trim()); } catch (err) { setError((err as Error).message); setGuardando(false); }
  };
  return (
    <Modal titulo={titulo} cerrar={cerrar}>
      <form className="formulario" onSubmit={mandar} noValidate>
        {largo ? <AreaTexto etiqueta={etiqueta} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          : <Campo etiqueta={etiqueta} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />}
        {nota && <p className={peligro ? 'nota-peligro' : 'nota-info'}><span>{nota}</span></p>}
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="boton suave chico" onClick={cerrar}>Cancelar</button>
          <button className={`boton chico ${peligro ? 'peligro lleno' : 'primario'}`} disabled={guardando}>{guardando ? 'Guardando…' : boton}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Cobros en línea ----------
function Cobros({ version, listo }: { version: number; listo: (m: string) => void }) {
  const [estado, setEstado] = useState('');
  const { datos, error, cargando } = useDatos<Cobro[]>(`/admin/pagos/cobros?estado=${estado}&v=${version}`);
  const [revisando, setRevisando] = useState(false);
  const revisar = async () => {
    setRevisando(true);
    try { const r = await api<{ revisados: number; actualizados: number }>('/admin/pagos/cobros/revisar', { method: 'POST' }); listo(`Se revisaron ${r.revisados} cobros en Flow; ${r.actualizados} cambiaron de estado`); }
    catch (e) { window.alert((e as Error).message); } finally { setRevisando(false); }
  };
  const copiar = (url: string) => navigator.clipboard.writeText(url).then(() => listo('Enlace copiado: puedes mandarlo por WhatsApp o correo'));
  return (
    <>
      <div className="filtros">
        <div className="segmentos">
          {[['', 'Todos'], ['pendiente', 'Esperando pago'], ['rechazado', 'Rechazados'], ['pagado', 'Pagados']].map(([v, t]) => (
            <button key={v} type="button" className={estado === v ? 'activo' : ''} onClick={() => setEstado(v)}>{t}</button>
          ))}
        </div>
        <button type="button" className="boton secundario chico empujar" disabled={revisando} onClick={revisar}><RefreshCw size={16} /> {revisando ? 'Revisando…' : 'Revisar estados en Flow'}</button>
      </div>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.length === 0 ? <Vacio>Aún no hay cobros en línea. Usa "Cobrar ahora" o espera a que un cliente pague desde el portal.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Suscripción</th><th>Periodo</th><th>Cómo</th><th className="num">Monto</th><th>Estado</th><th /></tr></thead>
          <tbody>{datos.map((k) => (
            <tr key={k.id}>
              <td>{fechaCorta(k.created_at)}</td>
              <td><Link to={`/admin/clientes/${k.cliente_id}`}>{k.cliente}</Link></td>
              <td><Link to={`/admin/suscripciones/${k.suscripcion_id}`}>{k.suscripcion}</Link></td>
              <td>{periodoTexto(k.periodo, k.cantidad_periodos)}</td>
              <td>{k.canal === 'tarjeta' ? `Tarjeta · intento ${k.intento}` : 'Enlace de pago'}<small>{ORIGEN[k.origen]}{k.medio_flow ? ` · ${k.medio_flow}` : ''}</small></td>
              <td className="num">{pesos(k.monto)}</td>
              <td><Etiqueta tono={ESTADO_COBRO[k.estado][0]}>{ESTADO_COBRO[k.estado][1]}</Etiqueta>{k.error && k.estado !== 'pagado' && <small>{k.error}</small>}</td>
              <td>{k.estado === 'pendiente' && k.url_pago && <button type="button" className="boton secundario mini" onClick={() => copiar(k.url_pago!)}><Copy size={14} /> Copiar enlace</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
    </>
  );
}

// ---------- Por validar (081, 082) ----------
function PorValidar({ version, listo }: { version: number; listo: (m: string) => void }) {
  const { datos, error, cargando } = useDatos<Pago[]>(`/admin/pagos/por-validar?v=${version}`);
  const [rechazar, setRechazar] = useState<Pago | null>(null);
  const ver = async (id: number) => {
    try { const { url } = await api<{ url: string }>(`/admin/pagos/${id}/comprobante`); window.open(url, '_blank', 'noopener'); } catch (e) { window.alert((e as Error).message); }
  };
  const validar = async (p: Pago) => {
    try { await api(`/admin/pagos/${p.id}/validar`, { method: 'POST' }); listo(`Pago de ${p.cliente} validado`); } catch (e) { window.alert((e as Error).message); }
  };
  return (
    <>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.length === 0 ? <Vacio>No hay pagos por validar.</Vacio> : (
        <div className="tabla"><table>
          <thead><tr><th>Informado</th><th>Cliente</th><th>Suscripción</th><th>Periodo</th><th>Medio</th><th className="num">Monto</th><th /></tr></thead>
          <tbody>{datos.map((p) => (
            <tr key={p.id}>
              <td>{fechaCorta(p.created_at)}</td>
              <td><Link to={`/admin/clientes/${p.cliente_id}`}>{p.cliente}</Link>{p.observaciones && <small>{p.observaciones}</small>}</td>
              <td><Link to={`/admin/suscripciones/${p.suscripcion_id}`}>{p.suscripcion}</Link></td>
              <td>{mesCorto(p.periodo)}</td>
              <td>{MEDIOS[p.medio_pago] ?? p.medio_pago}{p.referencia_externa && <small>N° {p.referencia_externa}</small>}</td>
              <td className="num">{pesos(p.monto)}</td>
              <td><div className="acciones sin-corte">
                {p.comprobante_path && <button type="button" className="boton secundario mini" onClick={() => ver(p.id)}>Ver comprobante</button>}
                <button type="button" className="boton peligro mini" onClick={() => setRechazar(p)}>Rechazar</button>
                <button type="button" className="boton primario mini" onClick={() => validar(p)}>Validar</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
      {rechazar && (
        <PedirTexto titulo={`Rechazar pago de ${rechazar.cliente}`} etiqueta="Motivo (lo verá el cliente)" boton="Rechazar pago" peligro largo
          nota="El cliente verá el motivo en su portal y podrá informar el pago de nuevo o pagar en línea."
          cerrar={() => setRechazar(null)} enviar={async (t) => { await api(`/admin/pagos/${rechazar.id}/rechazar`, { method: 'POST', body: { motivo: t } }); setRechazar(null); listo('Pago rechazado'); }} />
      )}
    </>
  );
}

// ---------- Historial (084) ----------
function Historial({ version, listo }: { version: number; listo: (m: string) => void }) {
  const [f, setF] = useState({ estado: '', medio: '', origen: '' });
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setBusqueda(q.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ pagina: String(pagina), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  if (busqueda) params.set('q', busqueda);
  const { datos, error, cargando } = useDatos<ListaPagos>(`/admin/pagos?${params}&v=${version}`);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  const sel = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPagina(1); };
  return (
    <>
      <div className="filtros">
        <label className="buscador-icono"><Search size={18} />
          <input className="buscador" type="search" placeholder="Cliente, suscripción o N° de boleta" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={f.estado} onChange={sel('estado')} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PAGO).map(([v, [, t]]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select value={f.medio} onChange={sel('medio')} aria-label="Medio">
          <option value="">Todos los medios</option>
          {['efectivo', 'transferencia', 'deposito', 'tarjeta', 'otro'].map((m) => <option key={m} value={m}>{MEDIOS[m]}</option>)}
        </select>
        <select value={f.origen} onChange={sel('origen')} aria-label="Origen">
          <option value="">En línea y manuales</option><option value="linea">Solo en línea (Flow)</option><option value="manual">Solo registrados a mano</option>
        </select>
      </div>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (datos.pagos.length === 0 ? <Vacio>No hay pagos que coincidan.</Vacio> : (
        <>
          <p className="suave">{datos.total} pagos · {pesos(datos.monto)} pagados</p>
          <TablaPagos pagos={datos.pagos} listo={listo} />
        </>
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

// ---------- Tarjetas inscritas ----------
function Tarjetas() {
  const { datos, error, cargando } = useDatos<Tarjeta[]>('/admin/pagos/tarjetas');
  return (
    <>
      <Aviso>{error}</Aviso>
      {cargando && !datos ? <Cargando /> : datos && (
        <div className="tabla"><table>
          <thead><tr><th>Cliente</th><th>Cómo paga</th><th>Inscrita</th><th>Suscripciones vigentes</th><th>Último rechazo</th></tr></thead>
          <tbody>{datos.map((t) => (
            <tr key={t.cliente_id}>
              <td><Link to={`/admin/clientes/${t.cliente_id}`}>{t.cliente}</Link>{t.email && <small>{t.email}</small>}</td>
              <td>{t.ultimos4 ? <Etiqueta tono="buena"><CreditCard size={13} /> {t.tipo ?? 'Tarjeta'} ···· {t.ultimos4}</Etiqueta> : <span className="suave">Enlace de pago o efectivo</span>}</td>
              <td>{t.inscrita_at ? fechaCorta(t.inscrita_at) : '—'}</td>
              <td>{t.vigentes}</td>
              <td>{t.ultimo_rechazo ? <Etiqueta tono="mala">{fechaCorta(t.ultimo_rechazo)}</Etiqueta> : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
