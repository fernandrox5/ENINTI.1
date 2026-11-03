// RF-02 · HU-3: listado de instalaciones
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Aviso } from '../../componentes.jsx';
import { fecha } from '../../formato.js';

export default function Instalaciones() {
  const [lista, setLista] = useState([]);
  const [comuna, setComuna] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/instalaciones').then(setLista).catch((e) => setError(e.message));
  }, []);

  const comunas = [...new Set(lista.map((i) => i.comuna))].sort();
  const visibles = comuna ? lista.filter((i) => i.comuna === comuna) : lista;

  return (
    <section>
      <div className="titulo">
        <h1>Instalaciones</h1>
        <Link className="boton" to="/admin/instalaciones/nueva">+ Nueva instalación</Link>
      </div>
      <select className="buscador" value={comuna} onChange={(e) => setComuna(e.target.value)}>
        <option value="">Todas las comunas</option>
        {comunas.map((c) => <option key={c}>{c}</option>)}
      </select>
      <Aviso>{error}</Aviso>
      <div className="tabla">
        <table>
          <thead>
            <tr><th>Cliente</th><th>Dirección</th><th>Comuna</th><th>Potencia</th><th>Instalada</th><th>Suscripción</th></tr>
          </thead>
          <tbody>
            {visibles.map((i) => (
              <tr key={i.id}>
                <td><Link to={`/admin/clientes/${i.cliente_id}`}>{i.cliente}</Link></td>
                <td><Link to={`/admin/instalaciones/${i.id}`}>{i.direccion}</Link></td>
                <td>{i.comuna}</td>
                <td>{i.potencia_kw ? `${i.potencia_kw} kW` : '—'}</td>
                <td>{fecha(i.fecha_instalacion)}</td>
                <td>{i.suscripcion === 'activa' ? 'Activa' : 'Sin suscripción'}</td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan="6" className="vacio">No hay instalaciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
