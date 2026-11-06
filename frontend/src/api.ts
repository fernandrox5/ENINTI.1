// Cliente HTTP de la API: agrega el token de Supabase, lo renueva cuando expira
// y convierte los errores en mensajes legibles.
export type Rol = 'admin' | 'cliente' | 'tecnico';

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
}

export interface Sesion {
  token: string;
  refresh_token: string;
  usuario: Usuario;
}

// En desarrollo la API va por el proxy de Vite; en producción, VITE_API_URL apunta al backend
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;
const CLAVE = 'syntia_sesion';

// "Recordarme": la sesión se guarda en localStorage; si no, solo dura mientras la pestaña esté abierta
export function leerSesion(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE) ?? sessionStorage.getItem(CLAVE);
    return guardada ? (JSON.parse(guardada) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion | null, recordar?: boolean) {
  try {
    const enLocal = recordar ?? localStorage.getItem(CLAVE) !== null;
    localStorage.removeItem(CLAVE);
    sessionStorage.removeItem(CLAVE);
    if (sesion) (enLocal ? localStorage : sessionStorage).setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    /* sin almacenamiento disponible: la sesión dura solo mientras la página esté abierta */
  }
}

// El token de acceso dura una hora: se pide uno nuevo con el refresh token.
// Si varias llamadas fallan a la vez, comparten la misma renovación.
let renovando: Promise<boolean> | null = null;
function renovarSesion(): Promise<boolean> {
  renovando ??= (async () => {
    const refresh_token = leerSesion()?.refresh_token;
    if (!refresh_token) return false;
    const res = await fetch(`${BASE}/auth/renovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return false;
    guardarSesion((await res.json()) as Sesion);
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      renovando = null;
    });
  return renovando;
}

// fetch con el token; si responde 401 renueva la sesión una vez y reintenta
async function pedir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  const enviar = () => {
    const token = leerSesion()?.token;
    return fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: { ...opciones.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  };
  let res = await enviar();
  if (res.status === 401 && leerSesion()?.token) {
    if (await renovarSesion()) res = await enviar();
    if (res.status === 401) {
      guardarSesion(null);
      window.location.href = '/login';
    }
  }
  return res;
}

export async function api<T = unknown>(ruta: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await pedir(ruta, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  }
  const datos = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(datos.error || (res.status >= 500 || res.status === 404
      ? 'El servidor no está disponible en este momento. Intenta de nuevo en unos minutos.'
      : 'No se pudo completar la acción'));
  }
  return datos as T;
}
