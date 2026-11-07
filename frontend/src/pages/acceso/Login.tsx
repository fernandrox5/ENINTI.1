// Mockups 001 (escritorio) y 002 (celular): ingreso con Supabase Auth
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, type Sesion } from '../../api';
import { useSesion } from '../../sesion';
import { Marca } from '../../componentes';

export default function Login() {
  const { usuario, entrar } = useSesion();
  const navegar = useNavigate();
  const mensaje = (useLocation().state as { mensaje?: string } | null)?.mensaje;
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/inicio" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!correo.trim() || !password) return setError('Ingresa tu correo y tu contraseña');
    setEnviando(true);
    try {
      const sesion = await api<Sesion>('/auth/login', { method: 'POST', body: { correo, password } });
      entrar(sesion, recordar);
      navegar('/inicio', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <header className="login-barra solo-escritorio">
        <Marca />
        <nav>
          <Link to="/ayuda">Ayuda</Link>
          <Link to="/contacto">Contacto</Link>
        </nav>
      </header>

      <div className="login-cuerpo">
        <aside className="login-foto" aria-hidden="true">
          <div className="login-lema solo-escritorio">
            <p className="lema">Energía solar para el norte de Chile.</p>
            <p className="sublema">Instalación de paneles solares · Zona norte</p>
          </div>
        </aside>

        <main className="login-panel">
          <form className="login-form" onSubmit={enviar} noValidate>
            <h1 className="titulo-grande">
              <strong>Syntia.</strong> <span className="solo-escritorio">Inicia sesión para continuar.</span>
              <span className="solo-celular">Inicia sesión.</span>
            </h1>

            <label className="campo">
              <span className="oculto">Correo electrónico</span>
              <input type="email" autoComplete="email" inputMode="email" placeholder="Correo electrónico" required
                value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </label>

            <label className="campo campo-password">
              <span className="oculto">Contraseña</span>
              <input type={mostrar ? 'text' : 'password'} autoComplete="current-password" placeholder="Contraseña" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="enlace" onClick={() => setMostrar(!mostrar)}
                aria-label={mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {mostrar ? 'Ocultar' : 'Mostrar'}
              </button>
            </label>

            <div className="login-opciones">
              <label className="check solo-escritorio">
                <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
                <span>Recordarme</span>
              </label>
              <Link to="/recuperar" className="enlace">¿Olvidaste tu contraseña?</Link>
            </div>

            {mensaje && !error && <p className="aviso aviso-ok" role="status">{mensaje}</p>}
            {error && <p className="aviso aviso-error" role="alert">{error}</p>}

            <button className="boton primario" disabled={enviando}>
              {enviando ? 'Ingresando…' : <><span className="solo-escritorio">Continuar</span><span className="solo-celular">Ingresar</span></>}
            </button>

            <div className="separador">
              <span className="solo-escritorio">o</span>
              <span className="solo-celular">¿Primera vez?</span>
            </div>

            <Link to="/acceso" className="boton secundario">
              <span className="solo-escritorio">¿Primera vez? Pide tu acceso</span>
              <span className="solo-celular">Pide tu acceso</span>
            </Link>

            <p className="login-legal">
              Al continuar aceptas los <Link to="/terminos">Términos de uso</Link> y
              la <Link to="/privacidad">Política de privacidad</Link>.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
