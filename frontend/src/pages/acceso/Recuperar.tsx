// Mockup 003: ¿Olvidaste tu contraseña?
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api } from '../../api';
import { Aviso, Campo, Volver } from '../../componentes';

export default function Recuperar() {
  const navegar = useNavigate();
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!correo.trim()) return setError('Escribe tu correo');
    setEnviando(true);
    try {
      await api('/auth/recuperar', { method: 'POST', body: { correo } });
      navegar('/recuperar/revisa-correo', { state: { correo: correo.trim().toLowerCase() } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="acceso-pagina">
      <Volver a="/login" />
      <form className="acceso-form" onSubmit={enviar} noValidate>
        <span className="icono-cuadro"><Lock size={24} /></span>
        <h1 className="acceso-titulo">¿Olvidaste tu contraseña?</h1>
        <p className="acceso-texto">Escribe el correo con el que ingresas a Syntia y te enviaremos un enlace para crear una nueva.</p>
        <Campo etiqueta="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <Aviso>{error}</Aviso>
        <button className="boton primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
      </form>
    </main>
  );
}
