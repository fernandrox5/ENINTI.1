// Mockup 006: crear cuenta (cliente). Después se activa desde el correo (007).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Aviso, Campo, CampoContrasena, Volver } from '../../componentes';

export default function Registro() {
  const navegar = useNavigate();
  const [f, setF] = useState({ nombre: '', correo: '', telefono: '', password: '', acepta: true });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = (c: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [c]: e.target.value });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.nombre.trim() || !f.correo.trim()) return setError('Completa tu nombre y correo');
    if (f.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    if (!f.acepta) return setError('Debes aceptar los términos de uso y la política de privacidad');
    setEnviando(true);
    try {
      await api('/auth/registro', {
        method: 'POST',
        body: { nombre: f.nombre, correo: f.correo, telefono: f.telefono, password: f.password, acepta_condiciones: f.acepta },
      });
      navegar('/registro/revisa-correo', { state: { correo: f.correo.trim().toLowerCase() } });
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
        <h1 className="acceso-titulo">Crea tu cuenta</h1>
        <p className="acceso-texto">Con tu cuenta verás tus instalaciones, pagos y mantenciones de ENINTI.</p>
        <Campo etiqueta="Nombre completo" autoComplete="name" value={f.nombre} onChange={cambiar('nombre')} required />
        <Campo etiqueta="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={f.correo} onChange={cambiar('correo')} required
          ayuda="Usa el mismo correo que diste a ENINTI para ver tus instalaciones." />
        <Campo etiqueta="Teléfono" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={f.telefono} onChange={cambiar('telefono')} />
        <CampoContrasena etiqueta="Contraseña" autoComplete="new-password" value={f.password} onChange={cambiar('password')} ayuda="Mínimo 8 caracteres." required />
        <label className="check">
          <input type="checkbox" checked={f.acepta} onChange={(e) => setF({ ...f, acepta: e.target.checked })} />
          <span>Acepto los <Link to="/terminos" target="_blank">Términos de uso</Link> y la <Link to="/privacidad" target="_blank">Política de privacidad</Link>.</span>
        </label>
        <Aviso>{error}</Aviso>
        <button className="boton primario" disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
        <p className="acceso-pie">¿Ya tienes cuenta? <Link to="/login">Ingresar</Link></p>
      </form>
    </main>
  );
}
