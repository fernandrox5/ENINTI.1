// Pantalla después de ingresar. Confirma la sesión con el backend (token de Supabase
// verificado con JWKS). Los paneles de cada rol se construyen en las próximas entregas.
import { useEffect, useState } from 'react';
import { api, type Rol, type Usuario } from '../api';
import { useSesion } from '../sesion';
import { Marca } from '../componentes';

const ROLES: Record<Rol, string> = { admin: 'Administración', cliente: 'Portal del cliente', tecnico: 'Técnico' };

function saludo() {
  const hora = new Date().getHours();
  return hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export default function Inicio() {
  const { usuario, salir } = useSesion();
  const [verificado, setVerificado] = useState<Usuario | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ usuario: Usuario }>('/auth/yo')
      .then((r) => setVerificado(r.usuario))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!usuario) return null;
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="inicio">
      <header className="inicio-barra">
        <div className="inicio-marca">
          <Marca />
          <span className="inicio-area">{ROLES[usuario.rol]}</span>
        </div>
        <div className="inicio-usuario">
          <span className="avatar" aria-hidden="true">{iniciales(usuario.nombre)}</span>
          <span className="solo-escritorio">{usuario.nombre}</span>
          <button className="boton secundario chico" onClick={salir}>Salir</button>
        </div>
      </header>

      <main className="inicio-cuerpo">
        <p className="fecha">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</p>
        <h1 className="titulo-grande">
          <strong>{saludo()}, {usuario.nombre.split(' ')[0]}.</strong> <span>Tu sesión está activa.</span>
        </h1>
        {error && <p className="aviso-error" role="alert">{error}</p>}
        <section className="tarjeta">
          <h2>Estado de la sesión</h2>
          <dl className="datos">
            <div><dt>Usuario</dt><dd>{usuario.nombre}</dd></div>
            <div><dt>Perfil</dt><dd>{ROLES[usuario.rol]}</dd></div>
            <div><dt>Verificación</dt><dd>{verificado ? <span className="etiqueta buena">Token verificado por el servidor</span> : error ? '—' : 'Verificando…'}</dd></div>
          </dl>
          <p className="nota">Los módulos de {ROLES[usuario.rol].toLowerCase()} se habilitan en las próximas entregas.</p>
        </section>
      </main>
    </div>
  );
}

function iniciales(nombre: string) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
