// RF-09 · HU-7: inscribir medio de pago en ambiente de pruebas · RF-19: aceptar condiciones antes de inscribir
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso } from '../../componentes.jsx';
import { fecha } from '../../formato.js';
import Condiciones from './Condiciones.jsx';

const RESULTADOS = {
  ok: ['ok', 'Tu tarjeta quedó inscrita. La cuota se cobrará automáticamente cada mes.'],
  rechazada: ['error', 'La pasarela rechazó la inscripción. Intenta con otra tarjeta.'],
  anulada: ['error', 'Anulaste la inscripción. Puedes intentarlo de nuevo cuando quieras.'],
  error: ['error', 'No se pudo completar la inscripción. Intenta nuevamente.'],
};

// Envía el token a la pasarela por POST, igual que exige Webpay
function irAPasarela({ url, token }) {
  const form = Object.assign(document.createElement('form'), { method: 'POST', action: url });
  form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: 'TBK_TOKEN', value: token }));
  document.body.appendChild(form);
  form.submit();
}

export default function MedioPago() {
  const [params, setParams] = useSearchParams();
  const [estado, setEstado] = useState(null);
  const [condiciones, setCondiciones] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const resultado = RESULTADOS[params.get('resultado')];

  const cargar = () => {
    api('/cuenta/medio-pago').then(setEstado).catch((e) => setError(e.message));
    api('/cuenta/condiciones').then(setCondiciones).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const accion = (fn) => async () => {
    setError('');
    setParams({});
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      setOcupado(false);
    }
  };

  const aceptar = accion(async () => {
    await api('/cuenta/condiciones', { method: 'POST' });
    cargar();
    setOcupado(false);
  });
  const inscribir = accion(async () => irAPasarela(await api('/cuenta/medio-pago/inscripcion', { method: 'POST' })));
  const quitar = accion(async () => {
    await api('/cuenta/medio-pago', { method: 'DELETE' });
    cargar();
    setOcupado(false);
  });

  if (!estado || !condiciones) return <section className="cuenta"><h1>Medio de pago</h1><Aviso>{error}</Aviso></section>;

  return (
    <section className="cuenta">
      <h1>Medio de pago</h1>
      {resultado && <Aviso tipo={resultado[0]}>{resultado[1]}</Aviso>}
      <Aviso>{error}</Aviso>

      {!estado.condiciones_aceptadas ? (
        <article className="tarjeta">
          <p>Antes de inscribir tu tarjeta debes leer y aceptar las condiciones del servicio.</p>
          <Condiciones condiciones={condiciones} />
          <button disabled={ocupado} onClick={aceptar}>Acepto las condiciones</button>
        </article>
      ) : estado.medio ? (
        <article className="tarjeta">
          <p className="tarjeta-inscrita">💳 {estado.medio.tipo_tarjeta} terminada en <strong>{estado.medio.ultimos_digitos}</strong></p>
          <p>Inscrita el {fecha(estado.medio.creado_en)}. La cuota mensual se cobra a esta tarjeta.</p>
          <div className="botones izquierda">
            <button disabled={ocupado} onClick={inscribir}>Cambiar tarjeta</button>
            <button className="secundario" disabled={ocupado} onClick={quitar}>Quitar tarjeta</button>
          </div>
        </article>
      ) : (
        <article className="tarjeta">
          <p>Inscribe tu tarjeta para que la cuota se cobre sola cada mes y no tengas que transferir.</p>
          <button disabled={ocupado} onClick={inscribir}>{ocupado ? 'Conectando…' : 'Inscribir tarjeta'}</button>
        </article>
      )}

      <p><small>
        Pago seguro mediante {estado.pasarela}, en ambiente de pruebas. ENINTI no guarda los datos de tu tarjeta.
      </small></p>
    </section>
  );
}
