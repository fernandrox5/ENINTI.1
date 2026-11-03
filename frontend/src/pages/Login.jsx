// RF-08 · HU-7: inicio de sesión (administrador, cliente y técnico)
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSesion, INICIO } from '../Sesion.jsx';
import { Campo, Aviso } from '../componentes.jsx';

export default function Login() {
  const { usuario, entrar } = useSesion();
  const navegar = useNavigate();
  const [form, setForm] = useState({ correo: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={INICIO[usuario.rol]} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const sesion = await api('/auth/login', { method: 'POST', body: form });
      entrar(sesion);
      navegar(INICIO[sesion.usuario.rol]);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="acceso">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>ENINTI</h1>
        <p>Ingresa a tu cuenta</p>
        <Campo etiqueta="Correo">
          <input type="email" autoComplete="email" required value={form.correo}
            onChange={(e) => setForm({ ...form, correo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Contraseña">
          <input type="password" autoComplete="current-password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Campo>
        <Aviso>{error}</Aviso>
        <button disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
        <p className="centro">¿Eres cliente y no tienes cuenta? <Link to="/registro">Regístrate</Link></p>
      </form>
    </main>
  );
}
