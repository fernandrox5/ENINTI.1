// Validaciones de datos de personas (RUT, correo y teléfono). Se aplican en el servidor, donde no se pueden saltar.
import { promises as dns } from 'node:dns';
import { pool } from '../config/db.js';

// Normaliza un RUT chileno a formato 12345678-9 (o 12345678-K) y valida su dígito verificador.
// Acepta puntos, espacios, guion y la K en mayúscula o minúscula.
export function normalizarRut(rut) {
  const limpio = String(rut || '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(limpio)) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado ? `${cuerpo}-${dv}` : null;
}

// RUT obligatorio, con dígito verificador correcto y que no sea de relleno (11.111.111-1, 22.222.222-2...)
// (`actual`: el RUT que ya tenía guardado; si no cambia, se acepta aunque sea de los datos de prueba)
export function rutValido(rut, { obligatorio = true, actual = null } = {}) {
  if (!String(rut || '').trim()) {
    if (obligatorio) throw new ErrorHttp(400, 'El RUT es obligatorio');
    return null;
  }
  const r = normalizarRut(rut);
  if (!r) throw new ErrorHttp(400, 'El RUT no es válido: revisa los números y el dígito verificador (puede ser K)');
  const cuerpo = r.split('-')[0];
  if (r === actual) return r;
  if (/^(\d)\1+$/.test(cuerpo) || Number(cuerpo) < 1000000) throw new ErrorHttp(400, 'Ese RUT no es real: usa el RUT de la persona o empresa');
  return r;
}

export const correoValido = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo || '');

// Correo con formato válido y con un dominio que recibe correos (evita errores como "gmial.com").
// Si no hay conexión para revisar el dominio, se acepta igual.
export async function correoReal(correo, { obligatorio = false } = {}) {
  const email = String(correo || '').trim().toLowerCase();
  if (!email) {
    if (obligatorio) throw new ErrorHttp(400, 'El correo es obligatorio');
    return null;
  }
  if (!correoValido(email)) throw new ErrorHttp(400, 'El correo no es válido');
  const dominio = email.split('@')[1];
  try {
    const mx = await Promise.race([dns.resolveMx(dominio), new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), 3000))]);
    if (!mx.length) throw Object.assign(new Error('sin correo'), { code: 'ENODATA' });
  } catch (err) {
    if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL'].includes(err.code)) throw new ErrorHttp(400, `El correo no existe: "${dominio}" no recibe correos. Revisa que esté bien escrito.`);
  }
  return email;
}

// Teléfono chileno: se guarda como +56 seguido de 9 dígitos (celular +569XXXXXXXX o fijo con código de área)
export function telefonoValido(telefono) {
  const t = String(telefono || '').trim();
  if (!t) return null;
  let d = t.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('56')) d = d.slice(2);
  if (!/^\d{9}$/.test(d)) throw new ErrorHttp(400, 'El teléfono no es válido: usa 9 dígitos, por ejemplo +56 9 1234 5678');
  return `+56${d}`;
}

// Un correo es de una sola persona: no puede repetirse entre clientes, técnicos ni administradores
export async function correoLibre(email, { clienteId = null, tecnicoId = null } = {}) {
  if (!email) return;
  const { rows: [uso] } = await pool.query(
    `SELECT 'cliente' AS quien FROM clientes WHERE lower(email) = $1 AND id <> coalesce($2::bigint, 0)
     UNION ALL SELECT 'técnico' FROM tecnicos WHERE lower(email) = $1 AND id <> coalesce($3::bigint, 0)
     UNION ALL SELECT 'administrador' FROM perfiles WHERE lower(email) = $1 AND rol = 'admin'
     LIMIT 1`, [email, clienteId, tecnicoId]);
  if (uso) throw new ErrorHttp(409, `Ese correo ya lo usa un ${uso.quien}. Cada persona necesita su propio correo.`);
}

// El RUT no se repite entre clientes ni entre técnicos
export async function rutLibre(rut, tabla, id = null) {
  if (!rut) return;
  const { rows: [uso] } = await pool.query(`SELECT nombre FROM ${tabla === 'tecnicos' ? 'tecnicos' : 'clientes'} WHERE rut = $1 AND id <> coalesce($2::bigint, 0) LIMIT 1`, [rut, id]);
  if (uso) throw new ErrorHttp(409, `Ese RUT ya está registrado (${uso.nombre}).`);
}

// Error con código HTTP para responder al cliente
export class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}
