// RF-10 · RF-14 · HU-8: meses pagados, deuda vigente e historial de pagos
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso, Estado } from '../../componentes.jsx';
import { pesos, fecha, mes, MEDIOS } from '../../formato.js';

export default function MiCuenta() {
  const [resumen, setResumen] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [error, setError] = useState('');
  const [params] = useSearchParams();

  useEffect(() => {
    api('/cuenta/resumen').then(setResumen).catch((e) => setError(e.message));
    api('/cuenta/pagos').then(setPagos).catch((e) => setError(e.message));
  }, []);

  return (
    <section className="cuenta">
      <h1>Mi cuenta</h1>
      <Aviso>{error}</Aviso>
      {params.get('cancelada') && <Aviso tipo="ok">Tu suscripción fue cancelada.</Aviso>}

      {resumen?.length === 0 && (
        <p className="tarjeta">Aún no tienes instalaciones con suscripción. Si ya contrataste el servicio, comunícate con ENINTI.</p>
      )}

      <div className="resumenes">
        {resumen?.map((r) => (
          <article key={r.instalacion_id} className={`tarjeta resumen ${r.deuda > 0 ? 'con-deuda' : ''}`}>
            <header>
              <h2>{r.direccion}</h2>
              {r.estado === 'cancelada' ? <span className="etiqueta neutra">Cancelada</span> : <Estado deuda={r.deuda} />}
            </header>
            <p className="comuna">{r.comuna}</p>
            <dl>
              <div><dt>Meses pagados</dt><dd>{r.meses_pagados}</dd></div>
              <div><dt>Deuda vigente</dt><dd className={r.deuda > 0 ? 'mala' : ''}>{pesos(r.deuda)}</dd></div>
            </dl>
            {r.deuda > 0 && <p>Tienes {r.meses_adeudados} {r.meses_adeudados === 1 ? 'mes' : 'meses'} sin pagar.</p>}
            {r.proximo_vencimiento && (
              <p>Próxima cuota: {pesos(r.cuota_mensual)} · vence el <span className="sin-corte">{fecha(r.proximo_vencimiento)}</span></p>
            )}
            {r.estado === 'cancelada' && <p>Suscripción cancelada el {fecha(r.fecha_cancelacion)}.</p>}
            <p className="enlaces"><Link to={`/cuenta/instalaciones/${r.instalacion_id}`}>Ver ficha técnica →</Link></p>
          </article>
        ))}
      </div>

      <h2>Historial de pagos</h2>
      <div className="tabla">
        <table className="apilable">
          <thead><tr><th>Fecha</th><th>Mes pagado</th><th>Monto</th><th>Medio</th><th>Instalación</th></tr></thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id}>
                <td data-etiqueta="Fecha">{fecha(p.fecha_pago)}</td>
                <td data-etiqueta="Mes pagado">{mes(p.periodo)}</td>
                <td data-etiqueta="Monto">{pesos(p.monto)}</td>
                <td data-etiqueta="Medio">{MEDIOS[p.medio]}</td>
                <td data-etiqueta="Instalación">{p.direccion}</td>
              </tr>
            ))}
            {pagos.length === 0 && <tr><td colSpan="5" className="vacio">Aún no hay pagos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
