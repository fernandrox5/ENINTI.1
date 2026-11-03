// RF-03 · HU-4: calendario de mantenciones por comuna, con programación y asignación de técnico
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso, Campo } from '../../componentes.jsx';
import { fecha, mes } from '../../formato.js';

const hoy = () => new Date().toLocaleDateString('en-CA');
const iso = (d) => d.toLocaleDateString('en-CA');
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function rangoMes(base) {
  const [a, m] = base.split('-').map(Number);
  return { desde: iso(new Date(a, m - 1, 1)), hasta: iso(new Date(a, m, 0)) };
}

export default function Calendario() {
  const [filtro, setFiltro] = useState({ ...rangoMes(hoy()), comuna_id: '' });
  const [vista, setVista] = useState('comuna');
  const [lista, setLista] = useState([]);
  const [comunas, setComunas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [programando, setProgramando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = () => {
    const q = new URLSearchParams(filtro);
    if (!filtro.comuna_id) q.delete('comuna_id');
    api(`/mantenciones?${q}`).then(setLista).catch((e) => setError(e.message));
  };

  useEffect(() => {
    api('/instalaciones/comunas').then(setComunas).catch((e) => setError(e.message));
    api('/mantenciones/tecnicos').then(setTecnicos).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { setError(''); cargar(); }, [filtro]);

  const porComuna = useMemo(() => {
    const g = {};
    lista.forEach((m) => (g[m.comuna] ||= []).push(m));
    return Object.entries(g);
  }, [lista]);

  const actualizar = async (id, cambios, mensaje) => {
    setError(''); setOk('');
    try {
      await api(`/mantenciones/${id}`, { method: 'PUT', body: cambios });
      setOk(mensaje);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const moverMes = (paso) => {
    const [a, m] = filtro.desde.split('-').map(Number);
    setFiltro({ ...filtro, ...rangoMes(iso(new Date(a, m - 1 + paso, 1))) });
  };

  const fila = (m) => (
    <tr key={m.id}>
      <td data-etiqueta="Fecha"><strong className="sin-corte">{fecha(m.fecha_programada)}</strong></td>
      <td data-etiqueta="Cliente">{m.cliente}<br /><small>{m.telefono}</small></td>
      <td data-etiqueta="Dirección"><Link to={`/admin/instalaciones/${m.instalacion_id}`}>{m.direccion}</Link></td>
      <td data-etiqueta="Tipo">{m.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</td>
      <td data-etiqueta="Técnico">
        {m.estado === 'programada' ? (
          <select aria-label="Técnico asignado" value={m.tecnico_id || ''}
            onChange={(e) => actualizar(m.id, { tecnico_id: e.target.value ? Number(e.target.value) : null }, 'Técnico asignado')}>
            <option value="">Sin asignar</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        ) : (m.tecnico || '—')}
      </td>
      <td data-etiqueta="Estado">
        <span className={`etiqueta ${m.estado === 'finalizada' ? 'buena' : m.tecnico_id ? 'neutra' : 'mala'}`}>
          {m.estado === 'programada' ? (m.tecnico_id ? 'Programada' : 'Falta técnico') : m.estado === 'finalizada' ? 'Finalizada' : 'En curso'}
        </span>
      </td>
      <td>
        {m.estado === 'programada' && (
          <button className="secundario chico" onClick={() => actualizar(m.id, { estado: 'cancelada' }, 'Mantención cancelada')}>Cancelar</button>
        )}
      </td>
    </tr>
  );

  return (
    <section>
      <div className="titulo">
        <h1>Mantenciones</h1>
        <button onClick={() => setProgramando(true)}>+ Programar mantención</button>
      </div>

      <div className="filtros">
        <Campo etiqueta="Comuna">
          <select value={filtro.comuna_id} onChange={(e) => setFiltro({ ...filtro, comuna_id: e.target.value })}>
            <option value="">Todas</option>
            {comunas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Desde"><input type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} /></Campo>
        <div className="pestanas" role="tablist">
          <button role="tab" aria-selected={vista === 'comuna'} className={vista === 'comuna' ? '' : 'secundario'} onClick={() => setVista('comuna')}>Por comuna</button>
          <button role="tab" aria-selected={vista === 'mes'} className={vista === 'mes' ? '' : 'secundario'} onClick={() => setVista('mes')}>Calendario</button>
        </div>
      </div>

      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>

      {vista === 'comuna' ? (
        <>
          <p>{lista.length} mantenciones entre el {fecha(filtro.desde)} y el {fecha(filtro.hasta)}</p>
          {porComuna.map(([comuna, items]) => (
            <div key={comuna} className="grupo">
              <h2>{comuna} <small>· {items.length} {items.length === 1 ? 'visita' : 'visitas'}</small></h2>
              <div className="tabla">
                <table className="apilable">
                  <thead><tr><th>Fecha</th><th>Cliente</th><th>Dirección</th><th>Tipo</th><th>Técnico</th><th>Estado</th><th></th></tr></thead>
                  <tbody>{items.map(fila)}</tbody>
                </table>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p className="tarjeta vacio">No hay mantenciones en este rango.</p>}
        </>
      ) : (
        <Mes desde={filtro.desde} lista={lista} mover={moverMes} />
      )}

      {programando && (
        <Programar
          tecnicos={tecnicos}
          cerrar={() => setProgramando(false)}
          listo={() => { setProgramando(false); setOk('Mantención programada'); cargar(); }}
        />
      )}
    </section>
  );
}

// Vista mensual: cada día muestra las visitas con su comuna
function Mes({ desde, lista, mover }) {
  const [a, m] = desde.split('-').map(Number);
  const primero = new Date(a, m - 1, 1);
  const dias = new Date(a, m, 0).getDate();
  const blancos = (primero.getDay() + 6) % 7;
  const delDia = (d) => lista.filter((x) => x.fecha_programada === iso(new Date(a, m - 1, d)));

  return (
    <div className="tarjeta">
      <div className="titulo">
        <button className="secundario chico" onClick={() => mover(-1)} aria-label="Mes anterior">←</button>
        <h2>{mes(desde)}</h2>
        <button className="secundario chico" onClick={() => mover(1)} aria-label="Mes siguiente">→</button>
      </div>
      <div className="mes">
        {DIAS.map((d) => <div key={d} className="dia-nombre">{d}</div>)}
        {Array.from({ length: blancos }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: dias }, (_, i) => {
          const visitas = delDia(i + 1);
          return (
            <div key={i} className={`dia ${visitas.length ? 'con-visitas' : ''}`}>
              <span className="numero">{i + 1}</span>
              {visitas.map((v) => (
                <span key={v.id} className={`visita ${v.tecnico_id ? '' : 'sin-tecnico'}`} title={`${v.cliente} · ${v.direccion} · ${v.tecnico || 'sin técnico'}`}>
                  {v.comuna}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Programar({ tecnicos, cerrar, listo }) {
  const [instalaciones, setInstalaciones] = useState([]);
  const [form, setForm] = useState({ instalacion_id: '', fecha_programada: '', tipo: 'preventiva', tecnico_id: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/instalaciones').then((l) => setInstalaciones(l.filter((i) => i.suscripcion === 'activa'))).catch((e) => setError(e.message));
  }, []);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/mantenciones', { method: 'POST', body: { ...form, tecnico_id: form.tecnico_id ? Number(form.tecnico_id) : null } });
      listo();
    } catch (err) {
      setError(err.message);
    }
  };

  const cambiar = (c) => (e) => setForm({ ...form, [c]: e.target.value });

  return (
    <div className="fondo" onClick={cerrar}>
      <form className="tarjeta modal" onSubmit={enviar} onClick={(e) => e.stopPropagation()}>
        <h2>Programar mantención</h2>
        <Campo etiqueta="Instalación">
          <select required value={form.instalacion_id} onChange={cambiar('instalacion_id')}>
            <option value="">Selecciona…</option>
            {instalaciones.map((i) => <option key={i.id} value={i.id}>{i.comuna} · {i.cliente} · {i.direccion}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Fecha"><input type="date" required min={hoy()} value={form.fecha_programada} onChange={cambiar('fecha_programada')} /></Campo>
        <Campo etiqueta="Tipo">
          <select value={form.tipo} onChange={cambiar('tipo')}>
            <option value="preventiva">Preventiva</option>
            <option value="correctiva">Correctiva</option>
          </select>
        </Campo>
        <Campo etiqueta="Técnico">
          <select value={form.tecnico_id} onChange={cambiar('tecnico_id')}>
            <option value="">Asignar después</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="secundario" onClick={cerrar}>Cancelar</button>
          <button>Programar</button>
        </div>
      </form>
    </div>
  );
}
