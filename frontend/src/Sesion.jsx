import { createContext, useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { leerSesion, guardarSesion } from './api.js';

const Contexto = createContext(null);

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesion);

  const entrar = (datos) => {
    guardarSesion(datos);
    setSesion(datos);
  };
  const salir = () => {
    guardarSesion(null);
    setSesion(null);
  };

  return <Contexto.Provider value={{ usuario: sesion?.usuario, entrar, salir }}>{children}</Contexto.Provider>;
}

export const useSesion = () => useContext(Contexto);

export const INICIO = { administrador: '/admin/clientes', cliente: '/cuenta', tecnico: '/tecnico' };

// Protege una ruta según el rol
export function SoloRol({ rol, children }) {
  const { usuario } = useSesion();
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== rol) return <Navigate to={INICIO[usuario.rol]} replace />;
  return children;
}
