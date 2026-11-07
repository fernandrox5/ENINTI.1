// Destino del enlace de invitación: el cliente crea su contraseña y entra directo a Syntia
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api, type Sesion } from '../../api';
import { useSesion } from '../../sesion';
import { Aviso, CampoContrasena, Marca } from '../../componentes';

export default function Activar() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { entrar } = useSesion();
  const navegar = useNavigate();
  const [f, setF] = useState({ password: '', repetir: '' });
  const [error, setError] = useState('');
  const [vencido, setVencido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const largoOk = f.password.length >= 8;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!largoOk) return setError('Usa al menos 8 caracteres');
    if (f.password !== f.repetir) return setError('Las contraseñas no coinciden');
    setEnviando(true);
    try {
      const s = await api<Sesion>('/auth/activar', { method: 'POST', body: { token, t: params.get('t'), password: f.password } });
      entrar(s, true);
      navegar('/inicio', { replace: true });
    } catch (err) {
      const m = (err as Error).message;
      setError(m);
      setVencido(/venció|usado/.test(m));
      setEnviando(false);
    }
  };

  if (!token) {
    return (
      <main className="acceso-pagina">
        <Marca />
        <Aviso>El enlace no es válido.</Aviso>
        <Link to="/acceso" className="boton primario">Pedir un enlace nuevo</Link>
      </main>
    );
  }

  return (
    <main className="acceso-pagina">
      <Marca />
      <form className="acceso-form" onSubmit={enviar} noValidate>
        <h1 className="acceso-titulo">Activa tu cuenta</h1>
        <p className="acceso-texto">Crea tu contraseña para entrar a Syntia. Usa al menos 8 caracteres.</p>
        <CampoContrasena etiqueta="Contraseña" autoComplete="new-password" value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          ayuda={largoOk ? <span className="ok"><Check size={14} /> Tiene 8 caracteres o más</span> : 'Mínimo 8 caracteres'} />
        <CampoContrasena etiqueta="Repite la contraseña" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
        <Aviso>{error}</Aviso>
        {vencido
          ? <Link to="/acceso" className="boton primario">Pedir un enlace nuevo</Link>
          : <button className="boton primario" disabled={enviando}>{enviando ? 'Activando…' : 'Activar y entrar'}</button>}
        <p className="acceso-pie suave">Al activar tu cuenta aceptas los <Link to="/terminos" target="_blank">Términos de uso</Link> y la <Link to="/privacidad" target="_blank">Política de privacidad</Link>.</p>
      </form>
    </main>
  );
}
