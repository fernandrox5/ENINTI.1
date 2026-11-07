import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api, leerSesion, guardarSesion, type Rol, type Sesion, type Usuario } from './api';

interface ContextoSesion {
  usuario: Usuario | null;
  entrar: (sesion: Sesion, recordar: boolean) => void;
  salir: () => void;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);

  const entrar = useCallback((datos: Sesion, recordar: boolean) => {
    guardarSesion(datos, recordar);
    setSesion(datos);
  }, []);
  const salir = useCallback(() => {
    api('/auth/salir', { method: 'POST' }).catch(() => {}); // invalida la sesión en Supabase
    guardarSesion(null);
    setSesion(null);
  }, []);

  return <Contexto.Provider value={{ usuario: sesion?.usuario ?? null, entrar, salir }}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return contexto;
}

// Ruta que exige haber iniciado sesión
export function ConSesion({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  return usuario ? <>{children}</> : <Navigate to="/login" replace />;
}

// Ruta solo para un rol; los demás vuelven a su propia área
export function SoloRol({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { usuario } = useSesion();
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== rol) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
}
