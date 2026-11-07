// "¿Primera vez? Pide tu acceso": reemplaza al registro abierto. ENINTI crea las cuentas de sus
// clientes; si el correo está en su ficha, le llega la invitación para activar su cuenta.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api } from '../../api';
import { Aviso, Campo, Volver } from '../../componentes';

export default function PedirAcceso() {
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
      await api('/auth/pedir-acceso', { method: 'POST', body: { correo } });
      navegar('/acceso/revisa-correo', { state: { correo: correo.trim().toLowerCase() } });
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
        <span className="icono-cuadro"><KeyRound size={24} /></span>
        <h1 className="acceso-titulo">Pide tu acceso</h1>
        <p className="acceso-texto">
          Si eres cliente de ENINTI, escribe el correo que diste al contratar tu instalación y te enviaremos un enlace para activar tu cuenta.
        </p>
        <Campo etiqueta="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <Aviso>{error}</Aviso>
        <button className="boton primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
        <p className="acceso-pie">¿Ya tienes cuenta? <Link to="/login">Ingresar</Link></p>
      </form>
    </main>
  );
}
