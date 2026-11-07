// Carga datos de la API con estado de carga y error; `recargar` vuelve a pedirlos
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useDatos<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(Boolean(ruta));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ruta) return;
    let vigente = true;
    setCargando(true);
    setError('');
    api<T>(ruta)
      .then((d) => vigente && setDatos(d))
      .catch((e: Error) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => { vigente = false; };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, cargando, recargar, setDatos };
}
