// RF-01 · HU-1: suscripciones impagas · RF-05 · HU-2: registro manual de pagos
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso, Campo } from '../../componentes.jsx';
import { pesos, mes } from '../../formato.js';

export default function Impagos() {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [pagando, setPagando] = useState(null);

  const cargar = () => api('/pagos/impagos').then(setLista).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const total = lista.reduce((s, i) => s + i.monto_adeudado, 0);

  return (
    <section>
      <h1>Suscripciones impagas</h1>
      <p>{lista.length} suscripciones con cuotas vencidas · deuda total {pesos(total)}</p>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <div className="tabla">
        <table>
          <thead>
            <tr><th>Cliente</th><th>Instalación</th><th>Teléfono</th><th>Meses adeudados</th><th>Deuda</th><th>Desde</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <tr key={i.suscripcion_id}>
                <td><Link to={`/admin/clientes/${i.cliente_id}`}>{i.cliente}</Link><br /><small>{i.rut}</small></td>
                <td>{i.direccion}<br /><small>{i.comuna}</small>{i.estado === 'cancelada' && <> <span className="etiqueta neutra">Cancelada</span></>}</td>
                <td>{i.telefono ? <a href={`tel:${i.telefono}`}>{i.telefono}</a> : '—'}</td>
                <td><span className="etiqueta mala">{i.meses_adeudados}</span></td>
                <td><strong>{pesos(i.monto_adeudado)}</strong></td>
                <td>{mes(i.desde)}</td>
                <td><button onClick={() => { setOk(''); setPagando(i); }}>Registrar pago</button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan="7" className="vacio">No hay suscripciones con deuda. 🎉</td></tr>}
          </tbody>
        </table>
      </div>

      {pagando && (
        <PagoManual
          suscripcion={pagando}
          cerrar={() => setPagando(null)}
          listo={(r) => { setPagando(null); setOk(`Pago registrado: ${r.cuotas_pagadas} cuota(s) por ${pesos(r.total)}`); cargar(); }}
        />
      )}
    </section>
  );
}

// Formulario para registrar un pago por transferencia o efectivo
export function PagoManual({ suscripcion, cerrar, listo }) {
  const [cuotas, setCuotas] = useState([]);
  const [marcadas, setMarcadas] = useState([]);
  const [datos, setDatos] = useState({ medio: 'transferencia', fecha_pago: new Date().toLocaleDateString('en-CA'), referencia: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/pagos/suscripciones/${suscripcion.suscripcion_id}/pendientes`)
      .then((c) => { setCuotas(c); setMarcadas(c.filter((x) => x.vencida).map((x) => x.id)); })
      .catch((e) => setError(e.message));
  }, [suscripcion]);

  const alternar = (id) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const total = cuotas.filter((c) => marcadas.includes(c.id)).reduce((s, c) => s + c.monto, 0);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      listo(await api('/pagos/manual', { method: 'POST', body: { ...datos, cuotas: marcadas } }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fondo" onClick={cerrar}>
      <form className="tarjeta modal" onSubmit={enviar} onClick={(e) => e.stopPropagation()}>
        <h2>Registrar pago</h2>
        <p>{suscripcion.cliente} · {suscripcion.direccion}</p>
        <fieldset>
          <legend>Cuotas que paga</legend>
          {cuotas.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} />
              {mes(c.periodo)} · {pesos(c.monto)} {c.vencida && <span className="etiqueta mala">vencida</span>}
            </label>
          ))}
        </fieldset>
        <Campo etiqueta="Medio de pago">
          <select value={datos.medio} onChange={(e) => setDatos({ ...datos, medio: e.target.value })}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha del pago">
          <input type="date" required value={datos.fecha_pago} onChange={(e) => setDatos({ ...datos, fecha_pago: e.target.value })} />
        </Campo>
        {datos.medio === 'transferencia' && (
          <Campo etiqueta="N° de operación (opcional)">
            <input value={datos.referencia} onChange={(e) => setDatos({ ...datos, referencia: e.target.value })} />
          </Campo>
        )}
        <p><strong>Total: {pesos(total)}</strong></p>
        <Aviso>{error}</Aviso>
        <div className="botones">
          <button type="button" className="secundario" onClick={cerrar}>Cancelar</button>
          <button disabled={marcadas.length === 0}>Registrar pago</button>
        </div>
      </form>
    </div>
  );
}
