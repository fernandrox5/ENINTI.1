// Cliente HTTP de la API: agrega el token y convierte errores en mensajes legibles
const CLAVE = 'eninti_sesion';

export function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE));
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  try {
    if (sesion) localStorage.setItem(CLAVE, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento disponible: la sesión dura solo esta pestaña */
  }
}

export async function api(ruta, { method = 'GET', body } = {}) {
  const token = leerSesion()?.token;
  const res = await fetch(`/api${ruta}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    guardarSesion(null);
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(datos.error || 'No se pudo completar la acción');
  return datos;
}

// Descarga un archivo protegido (ej. CSV) usando el token
export async function descargar(ruta, nombre) {
  const res = await fetch(`/api${ruta}`, {
    headers: { Authorization: `Bearer ${leerSesion()?.token}` },
  });
  if (!res.ok) throw new Error('No se pudo descargar el archivo');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}
