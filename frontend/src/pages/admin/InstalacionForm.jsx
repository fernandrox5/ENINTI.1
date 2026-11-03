// RF-02 · HU-3: crear y editar una instalación con su ficha técnica y suscripción
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Campo, Aviso } from '../../componentes.jsx';
import { pesos, fecha } from '../../formato.js';

const VACIO = {
  cliente_id: '', comuna_id: '', direccion: '', referencia: '', latitud: '', longitud: '',
  potencia_kw: '', inversor: '', paneles: '', cantidad_paneles: '', baterias: '', fecha_instalacion: '',
};

export default function InstalacionForm() {
  const { id } = useParams();
  const nueva = !id;
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [form, setForm] = useState({ ...VACIO, cliente_id: params.get('cliente') || '' });
  const [suscripcion, setSuscripcion] = useState({ con_suscripcion: true, fecha_inicio: '', dia_cobro: 5 });
  const [actual, setActual] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [comunas, setComunas] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api('/clientes').then(setClientes).catch((e) => setError(e.message));
    api('/instalaciones/comunas').then(setComunas).catch((e) => setError(e.message));
    if (!nueva) {
      api(`/instalaciones/${id}`)
        .then((i) => {
          setActual(i);
          setForm(Object.fromEntries(Object.keys(VACIO).map((k) => [k, i[k] ?? ''])));
        })
        .catch((e) => setError(e.message));
    }
  }, [id, nueva]);

  const cambiar = (c) => (e) => setForm({ ...form, [c]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      if (nueva) {
        const { id: nuevoId } = await api('/instalaciones', { method: 'POST', body: { ...form, ...suscripcion } });
        navegar(`/admin/instalaciones/${nuevoId}`, { replace: true });
      } else {
        await api(`/instalaciones/${id}`, { method: 'PUT', body: form });
        setOk('Cambios guardados');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <p><Link to="/admin/instalaciones">← Volver a instalaciones</Link></p>
      <h1>{nueva ? 'Nueva instalación' : actual?.direccion}</h1>
      <form className="formulario" onSubmit={guardar}>
        <h2 className="completo">Ubicación</h2>
        <Campo etiqueta="Cliente">
          <select required value={form.cliente_id} onChange={cambiar('cliente_id')}>
            <option value="">Selecciona…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.rut}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Comuna">
          <select required value={form.comuna_id} onChange={cambiar('comuna_id')}>
            <option value="">Selecciona…</option>
            {comunas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Dirección"><input required value={form.direccion} onChange={cambiar('direccion')} /></Campo>
        <Campo etiqueta="Referencia"><input value={form.referencia} onChange={cambiar('referencia')} /></Campo>
        <Campo etiqueta="Latitud"><input type="number" step="any" value={form.latitud} onChange={cambiar('latitud')} /></Campo>
        <Campo etiqueta="Longitud"><input type="number" step="any" value={form.longitud} onChange={cambiar('longitud')} /></Campo>

        <h2 className="completo">Ficha técnica</h2>
        <Campo etiqueta="Potencia (kW)"><input type="number" step="0.01" min="0" value={form.potencia_kw} onChange={cambiar('potencia_kw')} /></Campo>
        <Campo etiqueta="Inversor"><input value={form.inversor} onChange={cambiar('inversor')} /></Campo>
        <Campo etiqueta="Paneles (modelo)"><input value={form.paneles} onChange={cambiar('paneles')} /></Campo>
        <Campo etiqueta="Cantidad de paneles"><input type="number" min="0" value={form.cantidad_paneles} onChange={cambiar('cantidad_paneles')} /></Campo>
        <Campo etiqueta="Baterías"><input value={form.baterias} onChange={cambiar('baterias')} /></Campo>
        <Campo etiqueta="Fecha de instalación"><input type="date" value={form.fecha_instalacion} onChange={cambiar('fecha_instalacion')} /></Campo>

        <h2 className="completo">Suscripción</h2>
        {nueva ? (
          <>
            <label className="check completo">
              <input type="checkbox" checked={suscripcion.con_suscripcion}
                onChange={(e) => setSuscripcion({ ...suscripcion, con_suscripcion: e.target.checked })} />
              Crear suscripción del plan básico ({pesos(15000)} mensuales, 2 mantenciones al año)
            </label>
            {suscripcion.con_suscripcion && (
              <>
                <Campo etiqueta="Fecha de inicio" ayuda="Si la dejas vacía, parte hoy">
                  <input type="date" value={suscripcion.fecha_inicio}
                    onChange={(e) => setSuscripcion({ ...suscripcion, fecha_inicio: e.target.value })} />
                </Campo>
                <Campo etiqueta="Día de cobro (1 a 28)">
                  <input type="number" min="1" max="28" value={suscripcion.dia_cobro}
                    onChange={(e) => setSuscripcion({ ...suscripcion, dia_cobro: e.target.value })} />
                </Campo>
              </>
            )}
          </>
        ) : actual?.suscripcion_id ? (
          <p className="completo">
            Activa desde el {fecha(actual.fecha_inicio)} · {pesos(actual.cuota_mensual)} mensuales · cobro el día {actual.dia_cobro}
          </p>
        ) : (
          <p className="completo">Esta instalación no tiene suscripción activa.</p>
        )}

        <div className="acciones">
          <Aviso>{error}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <button>{nueva ? 'Crear instalación' : 'Guardar cambios'}</button>
        </div>
      </form>
    </section>
  );
}
