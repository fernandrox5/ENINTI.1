// Mockup 005: crea una nueva contraseña (destino del enlace de recuperación)
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../../api';
import { Aviso, CampoContrasena, Volver } from '../../componentes';

export default function NuevaContrasena() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navegar = useNavigate();
  const [f, setF] = useState({ password: '', repetir: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const largoOk = f.password.length >= 8;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!largoOk) return setError('Usa al menos 8 caracteres');
    if (f.password !== f.repetir) return setError('Las contraseñas no coinciden');
    setEnviando(true);
    try {
      await api('/auth/restablecer', { method: 'POST', body: { token, password: f.password } });
      navegar('/login', { replace: true, state: { mensaje: 'Tu contraseña quedó guardada. Ingresa con la nueva.' } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (!token) {
    return (
      <main className="acceso-pagina">
        <Volver a="/login" />
        <Aviso>El enlace no es válido. Pide uno nuevo.</Aviso>
        <Link to="/recuperar" className="boton primario">Pedir un enlace nuevo</Link>
      </main>
    );
  }

  return (
    <main className="acceso-pagina">
      <Volver a="/login" />
      <form className="acceso-form" onSubmit={enviar} noValidate>
        <h1 className="acceso-titulo">Crea una nueva contraseña</h1>
        <p className="acceso-texto">Usa al menos 8 caracteres. La usarás para ingresar a Syntia.</p>
        <CampoContrasena etiqueta="Nueva contraseña" autoComplete="new-password" value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          ayuda={largoOk ? <span className="ok"><Check size={14} /> Tiene 8 caracteres o más</span> : 'Mínimo 8 caracteres'} />
        <CampoContrasena etiqueta="Repite la contraseña" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
        <Aviso>{error}</Aviso>
        <button className="boton primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
        <p className="acceso-pie suave">Después de guardar vuelves a Ingresar.</p>
      </form>
    </main>
  );
}
