// RF-04 · HU-6: listado mensual de pagos y exportación para el contador
import { useEffect, useState } from 'react';
import { api, descargar } from '../../api.js';
import { Aviso } from '../../componentes.jsx';
import { pesos, fecha, mes, MEDIOS } from '../../formato.js';

export default function PagosMes() {
  const [periodo, setPeriodo] = useState(new Date().toLocaleDateString('en-CA').slice(0, 7));
  const [datos, setDatos] = useState({ pagos: [], total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!periodo) return;
    setError('');
    api(`/pagos/mensual?mes=${periodo}`).then(setDatos).catch((e) => setError(e.message));
  }, [periodo]);

  const exportar = () =>
    descargar(`/pagos/mensual.csv?mes=${periodo}`, `pagos-${periodo}.csv`).catch((e) => setError(e.message));

  return (
    <section>
      <div className="titulo">
        <h1>Pagos del mes</h1>
        <button onClick={exportar} disabled={!datos.pagos.length}>Exportar a Excel (CSV)</button>
      </div>
      <input type="month" className="buscador" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      <p>{datos.pagos.length} pagos recibidos en {mes(periodo + '-01')} · total <strong>{pesos(datos.total)}</strong></p>
      <Aviso>{error}</Aviso>
      <div className="tabla">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Cliente</th><th>Instalación</th><th>Mes pagado</th><th>Monto</th><th>Medio</th><th>Referencia</th></tr>
          </thead>
          <tbody>
            {datos.pagos.map((p) => (
              <tr key={p.id}>
                <td>{fecha(p.fecha_pago)}</td>
                <td>{p.cliente}<br /><small>{p.rut}</small></td>
                <td>{p.direccion}<br /><small>{p.comuna}</small></td>
                <td>{mes(p.periodo)}</td>
                <td>{pesos(p.monto)}</td>
                <td>{MEDIOS[p.medio]}</td>
                <td>{p.referencia || '—'}</td>
              </tr>
            ))}
            {datos.pagos.length === 0 && <tr><td colSpan="7" className="vacio">No hay pagos en este mes.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
