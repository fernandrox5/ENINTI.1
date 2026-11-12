// Formatos para mostrar datos (Chile)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export const pesos = (n: number | string | null | undefined) => '$' + Number(n || 0).toLocaleString('es-CL');

// 'AAAA-MM-DD' (o ISO) → '05-11-2026'
export const fecha = (f?: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('-') : '—');

// 'AAAA-MM-DD' → '18 nov 2026'
export const fechaCorta = (f?: string | null) => {
  if (!f) return '—';
  const [a, m, d] = f.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
};

// 'AAAA-MM-DD' → 'noviembre 2026'
export const mes = (f?: string | null) => (f ? `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : '—');

// Fecha y hora de un timestamp → '05-11-2026 14:30'
export const fechaHora = (f?: string | null) => {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};

export const hoyISO = () => new Date().toLocaleDateString('en-CA');

// Iniciales del nombre usando solo letras ("[PRUEBA] Cliente Invitado" → "PC")
export const iniciales = (nombre?: string | null) =>
  (nombre || '').split(/\s+/).map((p) => p.replace(/[^\p{L}]/gu, '')).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const MEDIOS: Record<string, string> = {
  transferencia: 'Transferencia', deposito: 'Depósito', efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro',
};
export const FRECUENCIAS: Record<string, string> = { mensual: 'al mes', trimestral: 'al trimestre', semestral: 'al semestre', anual: 'al año' };
export const SISTEMAS: Record<string, string> = { on_grid: 'On-grid', off_grid: 'Off-grid', hibrido: 'Híbrido' };
export const TIPOS_EQUIPO: Record<string, string> = {
  panel: 'Paneles', inversor: 'Inversor', bateria: 'Batería', estructura: 'Estructura', medidor: 'Medidor', otro: 'Otro',
};
export const TIPOS_MANTENCION: Record<string, string> = { preventiva: 'Preventiva', correctiva: 'Reparación', emergencia: 'Emergencia' };

// RUT con puntos y guion al terminar de escribirlo: "12345678k" → "12.345.678-K"
export const formatearRut = (rut: string) => {
  const limpio = rut.replace(/[^\dkK]/g, '').toUpperCase();
  if (limpio.length < 2) return rut;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
};
