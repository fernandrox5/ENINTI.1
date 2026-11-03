// RF-02 · HU-3: crear, editar y consultar un cliente con sus instalaciones
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Campo, Aviso } from '../../componentes.jsx';

const VACIO = { rut: '', nombre: '', correo: '', telefono: '', direccion: '' };

export default function ClienteForm() {
  const { id } = useParams();
  const nuevo = id === 'nuevo';
  const navegar = useNavigate();
  const [form, setForm] = useState(VACIO);
  const [instalaciones, setInstalaciones] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (nuevo) return;
    api(`/clientes/${id}`)
      .then(({ instalaciones, registrado, ...c }) => {
        setForm({ ...VACIO, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) });
        setInstalaciones(instalaciones);
      })
      .catch((e) => setError(e.message));
  }, [id, nuevo]);

  const cambiar = (c) => (e) => setForm({ ...form, [c]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      if (nuevo) {
        const { id: nuevoId } = await api('/clientes', { method: 'POST', body: form });
        navegar(`/admin/clientes/${nuevoId}`, { replace: true });
      } else {
        await api(`/clientes/${id}`, { method: 'PUT', body: form });
        setOk('Cambios guardados');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <p><Link to="/admin/clientes">← Volver a clientes</Link></p>
      <h1>{nuevo ? 'Nuevo cliente' : form.nombre}</h1>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="RUT"><input required value={form.rut} onChange={cambiar('rut')} /></Campo>
        <Campo etiqueta="Nombre"><input required value={form.nombre} onChange={cambiar('nombre')} /></Campo>
        <Campo etiqueta="Correo"><input type="email" value={form.correo} onChange={cambiar('correo')} /></Campo>
        <Campo etiqueta="Teléfono"><input type="tel" value={form.telefono} onChange={cambiar('telefono')} /></Campo>
        <Campo etiqueta="Dirección"><input value={form.direccion} onChange={cambiar('direccion')} /></Campo>
        <div className="acciones">
          <Aviso>{error}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <button>{nuevo ? 'Crear cliente' : 'Guardar cambios'}</button>
        </div>
      </form>

      {!nuevo && (
        <>
          <div className="titulo">
            <h2>Instalaciones</h2>
            <Link className="boton" to={`/admin/instalaciones/nueva?cliente=${id}`}>+ Agregar instalación</Link>
          </div>
          <div className="tabla">
            <table>
              <thead><tr><th>Dirección</th><th>Comuna</th><th>Potencia</th><th>Suscripción</th></tr></thead>
              <tbody>
                {instalaciones.map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/admin/instalaciones/${i.id}`}>{i.direccion}</Link></td>
                    <td>{i.comuna}</td>
                    <td>{i.potencia_kw ? `${i.potencia_kw} kW` : '—'}</td>
                    <td>{i.suscripcion === 'activa' ? 'Activa' : 'Sin suscripción'}</td>
                  </tr>
                ))}
                {instalaciones.length === 0 && <tr><td colSpan="4" className="vacio">Este cliente aún no tiene instalaciones.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
