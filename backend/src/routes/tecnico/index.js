// Panel del técnico (se monta en /api/tecnico, solo rol técnico): sus visitas asignadas (hoy,
// atrasadas, próximas y realizadas), el detalle para llegar y el informe con fotos desde el celular.
// Solo ve y edita las mantenciones que tiene asignadas.
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase } from '../../config/supabase.js';
import { ErrorHttp } from '../../utils/validar.js';
import { guardarInforme } from '../../services/informe.js';

const router = Router();

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Visita no encontrada'))));

async function miTecnico(req) {
  const { rows: [t] } = await pool.query('SELECT id, nombre, empresa FROM tecnicos WHERE perfil_id = $1 AND activo', [req.usuario.id]);
  if (!t) throw new ErrorHttp(403, 'Tu cuenta no está asociada a un técnico activo. Avísale a ENINTI.');
  return t;
}

const COLUMNAS = `m.id, m.tipo, m.estado, m.fecha_programada, m.fecha_realizada, m.hora_inicio, m.hora_fin, m.notas, m.numero_en_plan,
  i.id AS instalacion_id, i.codigo AS instalacion_codigo, coalesce(i.nombre, i.codigo) AS instalacion, i.direccion, i.latitud, i.longitud,
  i.tipo_sistema, i.potencia_kwp, l.nombre AS localidad, c.nombre AS cliente, c.telefono AS cliente_telefono`;
const DESDE = `FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id JOIN clientes c ON c.id = i.cliente_id
  LEFT JOIN localidades l ON l.id = i.localidad_id`;

router.get('/visitas', async (req, res) => {
  const t = await miTecnico(req);
  const [programadas, realizadas] = await Promise.all([
    pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE m.tecnico_id = $1 AND m.estado = 'programada'
                ORDER BY m.fecha_programada NULLS LAST, m.hora_inicio NULLS LAST`, [t.id]),
    pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE m.tecnico_id = $1 AND m.estado = 'realizada' AND m.fecha_realizada >= fn_hoy() - 60
                ORDER BY m.fecha_realizada DESC LIMIT 30`, [t.id]),
  ]);
  res.json({ tecnico: t, programadas: programadas.rows, realizadas: realizadas.rows });
});

async function miVisita(req) {
  const t = await miTecnico(req);
  const { rows: [m] } = await pool.query(
    `SELECT ${COLUMNAS}, m.trabajo_realizado, m.hallazgos, m.recomendaciones, m.requiere_inversion, m.detalle_inversion, m.costo_adicional
     ${DESDE} WHERE m.id = $1 AND m.tecnico_id = $2 AND m.estado <> 'cancelada'`, [req.params.id, t.id]);
  if (!m) throw new ErrorHttp(404, 'Visita no encontrada o no está asignada a ti');
  return { t, m };
}

router.get('/visitas/:id', async (req, res) => {
  const { m } = await miVisita(req);
  const [equipos, anterior, docs] = await Promise.all([
    pool.query(
      `SELECT tipo, marca, modelo, cantidad, potencia_unitaria_w, capacidad_kwh, fecha_instalacion,
              (fecha_instalacion + make_interval(years => vida_util_anios))::date AS fin_vida_util
       FROM equipos WHERE instalacion_id = $1 AND activo ORDER BY tipo, id`, [m.instalacion_id]),
    pool.query(
      `SELECT fecha_realizada, hallazgos, recomendaciones, detalle_inversion, t.nombre AS tecnico FROM mantenciones x LEFT JOIN tecnicos t ON t.id = x.tecnico_id
       WHERE x.instalacion_id = $1 AND x.estado = 'realizada' AND x.id <> $2 ORDER BY x.fecha_realizada DESC LIMIT 1`, [m.instalacion_id, m.id]),
    pool.query('SELECT id, tipo, nombre, storage_path FROM documentos WHERE mantencion_id = $1 ORDER BY created_at', [m.id]),
  ]);
  const documentos = [];
  for (const d of docs.rows) {
    const { data } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 600);
    documentos.push({ id: d.id, tipo: d.tipo, nombre: d.nombre, url: data?.signedUrl ?? null });
  }
  res.json({ ...m, equipos: equipos.rows, anterior: anterior.rows[0] ?? null, documentos });
});

router.post('/visitas/:id/informe', async (req, res) => {
  const { t, m } = await miVisita(req);
  await guardarInforme(m.id, req.body, { tecnicoId: t.id });
  res.json({ ok: true });
});

// Fotos desde el celular: URL firmada para subir directo a Storage y registro del documento (visible para el cliente)
router.post('/visitas/:id/fotos/subida', async (req, res) => {
  const { m } = await miVisita(req);
  const archivo = String(req.body?.archivo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  if (!archivo) throw new ErrorHttp(400, 'Falta el archivo');
  const ruta = `instalaciones/${m.instalacion_id}/${Date.now()}-${archivo}`;
  const { data, error } = await supabase.storage.from('documentos').createSignedUploadUrl(ruta);
  if (error) throw error;
  res.json({ ruta, url: data.signedUrl });
});

router.post('/visitas/:id/fotos', async (req, res) => {
  const { m } = await miVisita(req);
  const ruta = String(req.body.ruta || '');
  if (!ruta.startsWith(`instalaciones/${m.instalacion_id}/`)) throw new ErrorHttp(400, 'Ruta de archivo no válida');
  const tipo = req.body.tipo === 'informe' ? 'informe' : 'foto';
  const nombre = String(req.body.nombre || '').trim().slice(0, 120) || 'Foto de la visita';
  const { rows: [d] } = await pool.query(
    `INSERT INTO documentos (instalacion_id, mantencion_id, tipo, nombre, storage_path, visible_cliente, subido_por)
     VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`, [m.instalacion_id, m.id, tipo, nombre, ruta, req.usuario.id]);
  res.status(201).json(d);
});

export default router;
