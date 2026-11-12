// T-33 · Configuración (mockups 098 a 103): datos de contacto y reglas de cobro, planes, técnicos
// (con acceso a su panel), condiciones del servicio y correos enviados.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase } from '../../config/supabase.js';
import { ErrorHttp, correoLibre, correoReal, correoValido, rutLibre, rutValido, telefonoValido } from '../../utils/validar.js';
import { ejemplos, enviarEjemplos } from '../../services/notificar.js';
import { enviarCorreo } from '../../services/correo.js';
import { estadoAcceso, primerNombre, urlApp } from '../../services/invitaciones.js';

const router = Router();
const FRECUENCIAS = ['mensual', 'trimestral', 'semestral', 'anual'];
const vacio = (v) => (v === '' || v === undefined ? null : v);
const entero = (v, min, max, nombre) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorHttp(400, `${nombre}: escribe un número entre ${min} y ${max}`);
  return n;
};

// ---------- General ----------
const CLAVES = {
  whatsapp: 'WhatsApp de ENINTI para que los clientes escriban',
  telefono_contacto: 'Teléfono de contacto de ENINTI',
  email_admin: 'Correo que recibe los avisos del sistema',
  dias_plazo_pago: 'Días para pagar el mes antes de que la suscripción se cierre',
  reintentos_cobro: 'Intentos de cobro automático con tarjeta por mes',
};
router.get('/general', async (req, res) => {
  const { rows } = await pool.query('SELECT clave, valor FROM configuracion WHERE clave = ANY($1)', [Object.keys(CLAVES)]);
  res.json({ ...Object.fromEntries(Object.keys(CLAVES).map((k) => [k, ''])), ...Object.fromEntries(rows.map((r) => [r.clave, r.valor])),
    correos_automaticos: process.env.MAIL_ENABLED !== 'false', cobros_automaticos: process.env.COBROS_AUTOMATICOS === 'true' });
});
router.put('/general', async (req, res) => {
  const b = req.body;
  const telefono = (t, nombre) => { const d = String(t || '').replace(/\D/g, ''); if (d && (d.length < 8 || d.length > 12)) throw new ErrorHttp(400, `${nombre} no es válido`); return d ? `+${d.length === 9 ? `56${d}` : d}` : ''; };
  const valores = {
    whatsapp: telefono(b.whatsapp, 'El WhatsApp'),
    telefono_contacto: telefono(b.telefono_contacto, 'El teléfono'),
    email_admin: String(b.email_admin || '').trim().toLowerCase(),
    dias_plazo_pago: String(entero(b.dias_plazo_pago, 1, 30, 'Días para pagar')),
    reintentos_cobro: String(entero(b.reintentos_cobro, 1, 5, 'Reintentos de cobro')),
  };
  if (valores.email_admin && !correoValido(valores.email_admin)) throw new ErrorHttp(400, 'El correo no es válido');
  for (const [clave, valor] of Object.entries(valores)) {
    await pool.query(
      `INSERT INTO configuracion (clave, valor, descripcion) VALUES ($1, $2, $3)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`, [clave, valor, CLAVES[clave]]);
  }
  res.json({ ok: true });
});

// ---------- Planes ----------
router.get('/planes', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, (SELECT count(*)::int FROM suscripciones s WHERE s.tipo_suscripcion_id = t.id AND s.estado = 'vigente') AS vigentes
     FROM tipos_suscripcion t ORDER BY t.activo DESC, t.monto_clp`);
  res.json(rows);
});
function datosPlan(b) {
  const nombre = String(b.nombre || '').trim();
  if (nombre.length < 3) throw new ErrorHttp(400, 'Escribe el nombre del plan');
  if (!FRECUENCIAS.includes(b.frecuencia_pago)) throw new ErrorHttp(400, 'Elige cada cuánto se cobra');
  return {
    nombre, descripcion: vacio(String(b.descripcion || '').trim()), frecuencia_pago: b.frecuencia_pago,
    monto_clp: entero(b.monto_clp, 0, 10000000, 'Monto'), duracion_meses: entero(b.duracion_meses, 1, 60, 'Duración'),
    mantenciones_por_anio: entero(b.mantenciones_por_anio, 0, 12, 'Mantenciones al año'),
    incluye_reposicion_equipos: b.incluye_reposicion_equipos === true,
    tiempo_respuesta_horas: vacio(b.tiempo_respuesta_horas) === null ? null : entero(b.tiempo_respuesta_horas, 1, 720, 'Tiempo de respuesta'),
  };
}
router.post('/planes', async (req, res) => {
  const d = datosPlan(req.body);
  const codigo = d.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'PLAN';
  const { rows: [p] } = await pool.query(
    `INSERT INTO tipos_suscripcion (codigo, nombre, descripcion, frecuencia_pago, monto_clp, duracion_meses, mantenciones_por_anio, incluye_reposicion_equipos, tiempo_respuesta_horas)
     VALUES ($1 || CASE WHEN EXISTS (SELECT 1 FROM tipos_suscripcion WHERE codigo = $1) THEN '_' || floor(random() * 1000)::int ELSE '' END, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [codigo, d.nombre, d.descripcion, d.frecuencia_pago, d.monto_clp, d.duracion_meses, d.mantenciones_por_anio, d.incluye_reposicion_equipos, d.tiempo_respuesta_horas]);
  res.status(201).json(p);
});
// Los cambios valen para las suscripciones nuevas: las vigentes conservan su monto pactado
router.put('/planes/:id', async (req, res) => {
  const d = datosPlan(req.body);
  const { rowCount } = await pool.query(
    `UPDATE tipos_suscripcion SET nombre = $2, descripcion = $3, frecuencia_pago = $4, monto_clp = $5, duracion_meses = $6,
            mantenciones_por_anio = $7, incluye_reposicion_equipos = $8, tiempo_respuesta_horas = $9 WHERE id = $1`,
    [Number(req.params.id) || 0, d.nombre, d.descripcion, d.frecuencia_pago, d.monto_clp, d.duracion_meses, d.mantenciones_por_anio, d.incluye_reposicion_equipos, d.tiempo_respuesta_horas]);
  if (!rowCount) throw new ErrorHttp(404, 'Suscripción no encontrada');
  res.json({ ok: true });
});
router.post('/planes/:id/activo', async (req, res) => {
  const activo = req.body.activo === true;
  if (!activo) {
    const { rows: [{ n }] } = await pool.query("SELECT count(*)::int AS n FROM tipos_suscripcion WHERE activo AND id <> $1", [Number(req.params.id) || 0]);
    if (!n) throw new ErrorHttp(409, 'Debe quedar al menos un plan activo para que los clientes puedan contratar');
  }
  const { rowCount } = await pool.query('UPDATE tipos_suscripcion SET activo = $2 WHERE id = $1', [Number(req.params.id) || 0, activo]);
  if (!rowCount) throw new ErrorHttp(404, 'Suscripción no encontrada');
  res.json({ ok: true });
});

// ---------- Técnicos ----------
router.get('/tecnicos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.nombre, t.empresa, t.rut, t.telefono, t.email, t.es_subcontratista, t.activo, t.perfil_id,
            (SELECT count(*)::int FROM mantenciones m WHERE m.tecnico_id = t.id AND m.estado = 'programada') AS pendientes,
            (SELECT count(*)::int FROM mantenciones m WHERE m.tecnico_id = t.id AND m.estado = 'realizada') AS realizadas,
            (SELECT round(avg(calificacion_cliente), 1) FROM mantenciones m WHERE m.tecnico_id = t.id AND m.calificacion_cliente IS NOT NULL) AS calificacion
     FROM tecnicos t ORDER BY t.activo DESC, t.nombre`);
  for (const t of rows) t.acceso = t.email ? (await estadoAcceso(t.email)).estado : 'sin_correo';
  res.json(rows);
});
// Técnico: RUT real (acepta K) y no repetido, correo que existe y que no use otra persona, teléfono chileno
async function datosTecnico(b, id = null) {
  const nombre = String(b.nombre || '').trim();
  if (nombre.length < 3) throw new ErrorHttp(400, 'Escribe el nombre del técnico');
  const { rows: [antes] } = id ? await pool.query('SELECT rut FROM tecnicos WHERE id = $1', [id]) : { rows: [] };
  const rut = rutValido(b.rut, { actual: antes?.rut });
  const email = await correoReal(b.email);
  const telefono = telefonoValido(b.telefono);
  await rutLibre(rut, 'tecnicos', id);
  await correoLibre(email, { tecnicoId: id });
  const empresa = String(b.empresa || '').trim() || 'ENINTI';
  return { nombre, empresa, rut, telefono, email, es_subcontratista: empresa.toUpperCase() !== 'ENINTI' };
}
router.post('/tecnicos', async (req, res) => {
  const d = await datosTecnico(req.body);
  try {
    const { rows: [t] } = await pool.query(
      'INSERT INTO tecnicos (nombre, empresa, rut, telefono, email, es_subcontratista) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [d.nombre, d.empresa, d.rut, d.telefono, d.email, d.es_subcontratista]);
    res.status(201).json(t);
  } catch (err) {
    if (err.code === '23505') throw new ErrorHttp(409, 'Ya existe un técnico con ese correo');
    throw err;
  }
});
router.put('/tecnicos/:id', async (req, res) => {
  const d = await datosTecnico(req.body, Number(req.params.id) || 0);
  const { rowCount } = await pool.query(
    'UPDATE tecnicos SET nombre = $2, empresa = $3, rut = $4, telefono = $5, email = $6, es_subcontratista = $7 WHERE id = $1',
    [Number(req.params.id) || 0, d.nombre, d.empresa, d.rut, d.telefono, d.email, d.es_subcontratista]);
  if (!rowCount) throw new ErrorHttp(404, 'Técnico no encontrado');
  res.json({ ok: true });
});
router.post('/tecnicos/:id/activo', async (req, res) => {
  const activo = req.body.activo === true;
  const { rows: [t] } = await pool.query('UPDATE tecnicos SET activo = $2 WHERE id = $1 RETURNING perfil_id', [Number(req.params.id) || 0, activo]);
  if (!t) throw new ErrorHttp(404, 'Técnico no encontrado');
  // Sin acceso al panel mientras esté desactivado (no se borra: sus informes quedan)
  if (t.perfil_id) await pool.query('UPDATE perfiles SET activo = $2 WHERE id = $1', [t.perfil_id, activo]);
  res.json({ ok: true });
});
// Acceso a su panel: invitación por correo para crear su contraseña
router.post('/tecnicos/:id/acceso', async (req, res) => {
  const { rows: [t] } = await pool.query('SELECT id, nombre, email, activo FROM tecnicos WHERE id = $1', [Number(req.params.id) || 0]);
  if (!t) throw new ErrorHttp(404, 'Técnico no encontrado');
  if (!t.activo) throw new ErrorHttp(409, 'El técnico está desactivado');
  if (!t.email) throw new ErrorHttp(400, 'Agrega el correo del técnico para enviarle el acceso');
  const acceso = await estadoAcceso(t.email);
  if (acceso.estado === 'activo') throw new ErrorHttp(409, 'El técnico ya activó su cuenta');
  const { data, error } = acceso.estado === 'sin_cuenta'
    ? await supabase.auth.admin.generateLink({ type: 'invite', email: t.email, options: { data: { nombre: t.nombre } } })
    : await supabase.auth.admin.generateLink({ type: 'magiclink', email: t.email });
  if (error) throw error;
  // El trigger crea el perfil con rol técnico (su correo está en tecnicos); se vincula desde ya
  await pool.query('UPDATE tecnicos SET perfil_id = $1 WHERE id = $2 AND perfil_id IS NULL', [data.user.id, t.id]);
  const url = `${urlApp(req)}/activar?token=${encodeURIComponent(data.properties.hashed_token)}&t=${acceso.estado === 'sin_cuenta' ? 'invite' : 'email'}`;
  await enviarCorreo({
    para: t.email,
    asunto: 'Te sumaron al equipo de ENINTI en Syntia',
    titulo: `¡Hola, ${primerNombre(t.nombre)}!`,
    parrafos: ['En Syntia verás tus visitas, cómo llegar y podrás enviar el informe con fotos desde tu celular.'],
    boton: { texto: 'Crear mi contraseña', url },
    pie: 'El enlace sirve una sola vez. ENINTI · Energía solar en el norte de Chile.',
  });
  res.json({ correo: t.email });
});

// ---------- Condiciones del servicio ----------
router.get('/condiciones', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT count(*)::int FROM suscripciones s WHERE s.condiciones_id = c.id) AS aceptadas
     FROM condiciones_servicio c ORDER BY c.vigente_desde DESC, c.id DESC`);
  for (const c of rows) c.url = c.archivo_path ? supabase.storage.from('condiciones').getPublicUrl(c.archivo_path).data.publicUrl : null;
  res.json(rows);
});
router.post('/condiciones/subida', async (req, res) => {
  const version = String(req.body.version || '').trim().replace(/[^\w.-]+/g, '_');
  if (!version) throw new ErrorHttp(400, 'Escribe la versión');
  const ruta = `${version}-${Date.now()}.pdf`;
  const { data, error } = await supabase.storage.from('condiciones').createSignedUploadUrl(ruta);
  if (error) throw error;
  res.json({ ruta, url: data.signedUrl });
});
// Nueva versión: cierra la vigente y desde hoy los clientes aceptan esta
router.post('/condiciones', async (req, res) => {
  const version = String(req.body.version || '').trim();
  if (!version) throw new ErrorHttp(400, 'Escribe la versión');
  const ruta = vacio(req.body.archivo_path);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('UPDATE condiciones_servicio SET vigente_hasta = fn_hoy() WHERE vigente_hasta IS NULL AND vigente_desde < fn_hoy()');
    const { rows: [c] } = await db.query(
      'INSERT INTO condiciones_servicio (version, vigente_desde, archivo_path) VALUES ($1, fn_hoy(), $2) RETURNING id', [version, ruta]);
    await db.query("UPDATE configuracion SET valor = $1, updated_at = now() WHERE clave = 'version_condiciones'", [version]);
    await db.query('COMMIT');
    res.status(201).json(c);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new ErrorHttp(409, 'Ya existe esa versión, o ya publicaste una hoy');
    throw err;
  } finally {
    db.release();
  }
});

// ---------- Correos enviados ----------
router.get('/correos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.*, c.nombre AS cliente
     FROM notificaciones n LEFT JOIN clientes c ON c.id = n.cliente_id WHERE n.estado <> 'descartada'
     ORDER BY coalesce(n.enviada_at, n.created_at) DESC LIMIT 100`);
  res.json({ correos: rows, automaticos: process.env.MAIL_ENABLED !== 'false' });
});
// Los correos automáticos con un ejemplo de cada uno (para revisarlos o mostrarlos)
router.get('/correos/ejemplos', (req, res) => res.json(ejemplos(req)));
// Envía el ejemplo de un correo automático (el que se eligió) a una dirección, para mostrarlo sin esperar a que ocurra
router.post('/correos/ejemplos', async (req, res) => {
  const para = String(req.body.para || '').trim().toLowerCase();
  if (!correoValido(para)) throw new ErrorHttp(400, 'Escribe un correo válido');
  const n = await enviarEjemplos(req, para, { evento: req.body.evento, rol: req.body.rol });
  if (!n) throw new ErrorHttp(400, 'Elige qué correo enviar');
  res.json({ enviados: n, para });
});

export default router;
