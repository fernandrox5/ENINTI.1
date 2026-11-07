// Mockups 004 (recuperar) y 007 (activar): revisa tu correo
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../../api';
import { Aviso, Volver } from '../../componentes';

// Abre la bandeja del proveedor más común según el dominio del correo
function bandeja(correo: string) {
  const dominio = correo.split('@')[1] ?? '';
  if (dominio === 'gmail.com') return 'https://mail.google.com';
  if (/^(outlook|hotmail|live)\./.test(dominio)) return 'https://outlook.live.com/mail';
  if (/^yahoo\./.test(dominio)) return 'https://mail.yahoo.com';
  return null;
}

export default function RevisaCorreo({ tipo }: { tipo: 'activar' | 'recuperar' }) {
  const correo = (useLocation().state as { correo?: string } | null)?.correo;
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  if (!correo) return <Navigate to={tipo === 'activar' ? '/registro' : '/recuperar'} replace />;

  const reenviar = async () => {
    setEnviando(true);
    setEstado(null);
    try {
      await api(tipo === 'activar' ? '/auth/reenviar-activacion' : '/auth/recuperar', { method: 'POST', body: { correo } });
      setEstado({ tipo: 'ok', texto: 'Te enviamos un nuevo correo.' });
    } catch (e) {
      setEstado({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };
  const url = bandeja(correo);

  return (
    <main className="acceso-pagina">
      <Volver a={tipo === 'activar' ? '/registro' : '/recuperar'} />
      <div className="revisa-correo">
        <span className="icono-circulo"><Mail size={40} /></span>
        <h1>Revisa tu correo</h1>
        <p>
          Te enviamos un enlace a <strong>{correo}</strong>{' '}
          {tipo === 'activar' ? 'para activar tu cuenta. Al abrirlo entrarás directo a Syntia.' : 'para crear una nueva contraseña.'}
        </p>
        <p className="suave">¿No llegó? Revisa la carpeta de spam.</p>
      </div>
      <div className="revisa-acciones">
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        {url && <a className="boton primario" href={url} target="_blank" rel="noreferrer">Abrir el enlace del correo</a>}
        <button type="button" className="boton suave" onClick={reenviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Reenviar correo'}</button>
        <Link to="/login" className="enlace centrado">Volver a Ingresar</Link>
      </div>
    </main>
  );
}
