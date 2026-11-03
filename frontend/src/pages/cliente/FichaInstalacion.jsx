// RF-13 · HU-10: ficha técnica de la instalación · RF-16 · HU-12: cancelar suscripción en dos pasos
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso } from '../../componentes.jsx';
import { pesos, fecha } from '../../formato.js';

const DATO = (v, sufijo = '') => (v === null || v === undefined || v === '' ? 'Sin información' : `${v}${sufijo}`);

export default function FichaInstalacion() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    api(`/cuenta/instalaciones/${id}`).then(setFicha).catch((e) => setError(e.message));
  }, [id]);

  const cancelar = async () => {
    setCancelando(true);
    try {
      await api(`/cuenta/suscripciones/${ficha.suscripcion_id}/cancelar`, { method: 'POST' });
      navegar('/cuenta?cancelada=1');
    } catch (e) {
      setError(e.message);
      setConfirmando(false);
    } finally {
      setCancelando(false);
    }
  };

  return (
    <section className="cuenta">
      <p><Link to="/cuenta">← Volver a Mi cuenta</Link></p>
      <Aviso>{error}</Aviso>
      {ficha && (
        <>
          <h1>{ficha.direccion}</h1>
          <p className="comuna">{ficha.comuna}{ficha.referencia ? ` · ${ficha.referencia}` : ''}</p>

          <article className="tarjeta">
            <h2>Ficha técnica</h2>
            <dl className="ficha">
              <div><dt>Potencia</dt><dd>{DATO(ficha.potencia_kw, ' kW')}</dd></div>
              <div><dt>Inversor</dt><dd>{DATO(ficha.inversor)}</dd></div>
              <div><dt>Paneles</dt><dd>{ficha.paneles ? `${ficha.cantidad_paneles ?? '—'} × ${ficha.paneles}` : 'Sin información'}</dd></div>
              <div><dt>Baterías</dt><dd>{ficha.baterias || 'Sin baterías'}</dd></div>
              <div><dt>Fecha de instalación</dt><dd>{fecha(ficha.fecha_instalacion)}</dd></div>
            </dl>
          </article>

          <article className="tarjeta">
            <h2>Suscripción</h2>
            {ficha.suscripcion_id ? (
              <>
                <p>
                  Plan básico · {pesos(ficha.cuota_mensual)} mensuales · {ficha.mantenciones_anuales} mantenciones al año.
                  <br />Activa desde el {fecha(ficha.fecha_inicio)}. Se cobra el día {ficha.dia_cobro} de cada mes.
                </p>
                <button className="peligro" onClick={() => setConfirmando(true)}>Cancelar suscripción</button>
              </>
            ) : (
              <p>Esta instalación no tiene una suscripción activa.</p>
            )}
          </article>
        </>
      )}

      {confirmando && (
        <div className="fondo" onClick={() => setConfirmando(false)}>
          <div className="tarjeta modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>¿Cancelar la suscripción?</h2>
            <p>Se dejará de cobrar la cuota de {ficha.direccion} y se cancelarán las mantenciones programadas.</p>
            <p>Si tienes cuotas vencidas, seguirán pendientes de pago.</p>
            <div className="botones">
              <button className="secundario" onClick={() => setConfirmando(false)}>No, volver</button>
              <button className="peligro" disabled={cancelando} onClick={cancelar}>
                {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
