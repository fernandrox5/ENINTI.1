// Destino del enlace de activación: confirma la cuenta y entra directo a Syntia
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Sesion } from '../../api';
import { useSesion } from '../../sesion';
import { Aviso, Cargando, Marca } from '../../componentes';

export default function Activar() {
  const [params] = useSearchParams();
  const { entrar } = useSesion();
  const navegar = useNavigate();
  const [error, setError] = useState('');
  const usado = useRef(false); // el token sirve una sola vez (StrictMode monta dos veces en desarrollo)

  useEffect(() => {
    if (usado.current) return;
    usado.current = true;
    const token = params.get('token');
    if (!token) return setError('El enlace no es válido.');
    api<Sesion>('/auth/activar', { method: 'POST', body: { token } })
      .then((s) => { entrar(s, true); navegar('/inicio', { replace: true, state: { bienvenida: true } }); })
      .catch((e: Error) => setError(e.message));
  }, [params, entrar, navegar]);

  return (
    <main className="acceso-pagina centrada">
      <Marca />
      {error ? (
        <>
          <Aviso>{error}</Aviso>
          <Link to="/registro" className="boton primario">Crear cuenta de nuevo</Link>
          <Link to="/login" className="enlace centrado">Volver a Ingresar</Link>
        </>
      ) : <Cargando texto="Activando tu cuenta…" />}
    </main>
  );
}
