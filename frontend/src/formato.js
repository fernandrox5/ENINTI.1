const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

// 'AAAA-MM-DD' → '05-11-2026'
export const fecha = (f) => (f ? f.slice(0, 10).split('-').reverse().join('-') : '—');

// 'AAAA-MM-DD' → 'noviembre 2026'
export const mes = (f) => (f ? `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : '—');

export const MEDIOS = { transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta' };
