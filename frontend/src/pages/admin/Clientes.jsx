// RF-02 · HU-3: listado y búsqueda de clientes
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso } from '../../componentes.jsx';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/clientes?q=${encodeURIComponent(q)}`).then(setClientes).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section>
      <div className="titulo">
        <h1>Clientes</h1>
        <Link className="boton" to="/admin/clientes/nuevo">+ Nuevo cliente</Link>
      </div>
      <input className="buscador" placeholder="Buscar por nombre o RUT" value={q} onChange={(e) => setQ(e.target.value)} />
      <Aviso>{error}</Aviso>
      <div className="tabla">
        <table>
          <thead>
            <tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Instalaciones</th><th>Cuenta web</th></tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/admin/clientes/${c.id}`}>{c.nombre}</Link></td>
                <td>{c.rut}</td>
                <td>{c.telefono || '—'}</td>
                <td>{c.instalaciones}</td>
                <td>{c.registrado ? 'Registrado' : 'Sin registro'}</td>
              </tr>
            ))}
            {clientes.length === 0 && <tr><td colSpan="5" className="vacio">No hay clientes que coincidan.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
