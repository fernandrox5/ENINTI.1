// RF-08 · HU-7: registro del cliente · RF-19: aceptación de las condiciones
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSesion } from '../Sesion.jsx';
import { Campo, Aviso } from '../componentes.jsx';
import Condiciones from './cliente/Condiciones.jsx';

export default function Registro() {
  const { entrar } = useSesion();
  const navegar = useNavigate();
  const [form, setForm] = useState({ nombre: '', rut: '', correo: '', telefono: '', password: '', repetir: '', acepta_condiciones: false });
  const [condiciones, setCondiciones] = useState(null);
  const [verCondiciones, setVerCondiciones] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = (c) => (e) => setForm({ ...form, [c]: e.target.value });

  useEffect(() => {
    api('/auth/condiciones').then(setCondiciones).catch(() => {});
  }, []);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.repetir) return setError('Las contraseñas no coinciden');
    if (!form.acepta_condiciones) return setError('Debes aceptar las condiciones del servicio');
    setEnviando(true);
    try {
      const { repetir, ...datos } = form;
      entrar(await api('/auth/registro', { method: 'POST', body: datos }));
      navegar('/cuenta');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="acceso">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>Crear cuenta</h1>
        <p>Regístrate para ver el estado de tu servicio.</p>
        <Campo etiqueta="Nombre completo">
          <input required autoComplete="name" value={form.nombre} onChange={cambiar('nombre')} />
        </Campo>
        <Campo etiqueta="RUT" ayuda="Ejemplo: 12.345.678-9">
          <input required value={form.rut} onChange={cambiar('rut')} />
        </Campo>
        <Campo etiqueta="Correo">
          <input type="email" required autoComplete="email" value={form.correo} onChange={cambiar('correo')} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <input type="tel" autoComplete="tel" value={form.telefono} onChange={cambiar('telefono')} />
        </Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres">
          <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={cambiar('password')} />
        </Campo>
        <Campo etiqueta="Repite la contraseña">
          <input type="password" required autoComplete="new-password" value={form.repetir} onChange={cambiar('repetir')} />
        </Campo>
        <label className="check">
          <input type="checkbox" checked={form.acepta_condiciones}
            onChange={(e) => setForm({ ...form, acepta_condiciones: e.target.checked })} />
          <span>Acepto las <button type="button" className="enlace" onClick={() => setVerCondiciones(!verCondiciones)}>condiciones del servicio</button></span>
        </label>
        {verCondiciones && <Condiciones condiciones={condiciones} />}
        <Aviso>{error}</Aviso>
        <button disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
        <p className="centro">¿Ya tienes cuenta? <Link to="/login">Ingresa</Link></p>
      </form>
    </main>
  );
}
