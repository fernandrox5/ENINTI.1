// T-24 · RF-04, RF-05, RF-06: instalaciones y equipos — listado, ficha técnica, documentos,
// reemplazo de equipo y asistente de alta (mockups 055 a 071)
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { supabase } from '../../config/supabase.js';
import { normalizarRut, correoValido, ErrorHttp } from '../../utils/validar.js';
import { estadoAcceso, invitarCliente, primerNombre, urlApp } from '../../services/invitaciones.js';
import { enviarCorreo } from '../../services/correo.js';

const router = Router();
const POR_PAGINA = 20;
const TIPOS_EQUIPO = ['panel', 'inversor', 'bateria', 'estructura', 'medidor', 'otro'];
const TIPOS_DOCUMENTO = ['plano', 'foto', 'contrato', 'informe', 'otro'];

router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Instalación no encontrada'))));

const vacio = (v) => (v === '' || v === undefined ? null : v);

function datosInstalacion(b) {
  if (!b.direccion?.trim()) throw new ErrorHttp(400, 'La dirección es obligatoria');
  if (b.potencia_kwp !== undefined && b.potencia_kwp !== '' && !(Number(b.potencia_kwp) > 0)) throw new ErrorHttp(400, 'La potencia debe ser mayor que cero');
  if (b.tipo_sistema && !['on_grid', 'off_grid', 'hibrido'].includes(b.tipo_sistema)) throw new ErrorHttp(400, 'Tipo de sistema no válido');
  return {
    nombre: vacio(b.nombre?.trim()), direccion: b.direccion.trim(), localidad_id: vacio(b.localidad_id),
    latitud: vacio(b.latitud), longitud: vacio(b.longitud), fecha_instalacion: vacio(b.fecha_instalacion),
    potencia_kwp: vacio(b.potencia_kwp), tipo_sistema: vacio(b.tipo_sistema), instalada_por_eninti: b.instalada_por_eninti !== false,
    instalador_id: vacio(b.instalador_id), notas: vacio(b.notas?.trim()),
  };
}

function datosEquipo(e) {
  if (!TIPOS_EQUIPO.includes(e.tipo)) throw new ErrorHttp(400, 'Elige el tipo de equipo');
  if (e.cantidad !== undefined && e.cantidad !== '' && !(Number(e.cantidad) > 0)) throw new ErrorHttp(400, 'La cantidad debe ser mayor que cero');
  return {
    tipo: e.tipo, marca: vacio(e.marca?.trim()), modelo: vacio(e.modelo?.trim()), cantidad: vacio(e.cantidad) ?? 1,
    potencia_unitaria_w: vacio(e.potencia_unitaria_w), capacidad_kwh: vacio(e.capacidad_kwh), numero_serie: vacio(e.numero_serie?.trim()),
    fecha_instalacion: vacio(e.fecha_instalacion), garantia_hasta: vacio(e.garantia_hasta), vida_util_anios: vacio(e.vida_util_anios),
  };
}

async function insertar(db, tabla, datos, extra = {}) {
  const campos = { ...datos, ...extra };
  const cols = Object.keys(campos);
  const { rows: [r] } = await db.query(
    `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(campos)
  );
  return r;
}

// Opciones de los formularios: localidades, técnicos instaladores, planes activos y condiciones vigentes
router.get('/opciones', async (req, res) => {
  const [localidades, tecnicos, planes, condiciones] = await Promise.all([
    pool.query('SELECT id, nombre, comuna FROM localidades ORDER BY id'),
    pool.query('SELECT id, nombre, empresa FROM tecnicos WHERE activo ORDER BY nombre'),
    pool.query(`SELECT id, codigo, nombre, frecuencia_pago, monto_clp, duracion_meses, mantenciones_por_anio
                FROM tipos_suscripcion WHERE activo ORDER BY monto_clp`),
    pool.query('SELECT id, version, vigente_desde FROM condiciones_servicio WHERE vigente_hasta IS NULL ORDER BY vigente_desde DESC LIMIT 1'),
  ]);
  res.json({ localidades: localidades.rows, tecnicos: tecnicos.rows, planes: planes.rows, condiciones: condiciones.rows[0] ?? null });
});

// Listado (055): ?q= código, nombre, dirección o cliente · ?filtro=todas|al_dia|deuda|por_vencer|sin · ?pagina=
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filtros = {
    todas: 'TRUE',
    al_dia: "v.suscripcion_id IS NOT NULL AND v.periodos_adeudados = 0 AND v.dias_restantes > 30",
    deuda: 'v.periodos_adeudados > 0',
    por_vencer: 'v.dias_restantes BETWEEN 0 AND 30',
    sin: 'v.suscripcion_id IS NULL',
  };
  const filtro = filtros[req.query.filtro] ? req.query.filtro : 'todas';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const params = [];
  let busqueda = 'TRUE';
  if (q) { params.push(`%${q}%`); busqueda = '(i.codigo ILIKE $1 OR i.nombre ILIKE $1 OR i.direccion ILIKE $1 OR c.nombre ILIKE $1)'; }
  const base = `
    FROM instalaciones i
    JOIN clientes c ON c.id = i.cliente_id
    LEFT JOIN localidades l ON l.id = i.localidad_id
    LEFT JOIN v_suscripciones_estado v ON v.instalacion_id = i.id AND v.estado = 'vigente'
    WHERE i.activa AND ${busqueda}`;
  const { rows: [conteo] } = await pool.query(
    `SELECT count(*)::int AS todas, ${Object.entries(filtros).filter(([k]) => k !== 'todas').map(([k, w]) => `count(*) FILTER (WHERE ${w})::int AS ${k}`).join(', ')} ${base}`,
    params
  );
  const { rows } = await pool.query(
    `SELECT i.id, i.codigo, i.nombre, i.direccion, i.tipo_sistema, i.potencia_kwp, l.nombre AS localidad,
            c.id AS cliente_id, c.nombre AS cliente,
            v.suscripcion_id, v.dias_restantes, v.periodos_adeudados, v.pagos_por_validar,
            (SELECT json_build_object('fecha', m.fecha_programada, 'tecnico', t.nombre)
             FROM mantenciones m LEFT JOIN tecnicos t ON t.id = m.tecnico_id
             WHERE m.instalacion_id = i.id AND m.estado = 'programada' AND m.fecha_programada >= fn_hoy()
             ORDER BY m.fecha_programada LIMIT 1) AS proxima
     ${base} AND ${filtros[filtro]}
     ORDER BY i.codigo LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`,
    params
  );
  res.json({ instalaciones: rows, total: conteo[filtro], pagina, por_pagina: POR_PAGINA, conteo });
});

// Ficha completa (056 a 061)
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const { rows: [inst] } = await pool.query(
    `SELECT i.*, l.nombre AS localidad, l.comuna, c.nombre AS cliente, c.email AS cliente_email, t.nombre AS instalador, t.empresa AS instalador_empresa
     FROM instalaciones i
     JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN localidades l ON l.id = i.localidad_id
     LEFT JOIN tecnicos t ON t.id = i.instalador_id
     WHERE i.id = $1`, [id]);
  if (!inst) throw new ErrorHttp(404, 'Instalación no encontrada');
  const [equipos, documentos, suscripciones, mantenciones] = await Promise.all([
    pool.query(
      `SELECT e.*, (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date AS fin_vida_util,
              r.modelo AS reemplaza_modelo, r.tipo AS reemplaza_tipo, m.fecha_realizada AS retiro_mantencion_fecha
       FROM equipos e
       LEFT JOIN equipos r ON r.id = e.reemplaza_a_id
       LEFT JOIN mantenciones m ON m.id = e.mantencion_retiro_id
       WHERE e.instalacion_id = $1 ORDER BY e.activo DESC, e.tipo, e.id`, [id]),
    pool.query(
      `SELECT d.id, d.tipo, d.nombre, d.storage_path, d.visible_cliente, d.created_at, p.nombre AS subido_por
       FROM documentos d LEFT JOIN perfiles p ON p.id = d.subido_por
       WHERE d.instalacion_id = $1 ORDER BY d.created_at DESC`, [id]),
    pool.query(
      `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.tipo_nombre, v.monto_pactado, v.frecuencia_pago, v.fecha_inicio,
              v.fecha_termino, v.fecha_cierre, v.motivo_cierre, v.dias_restantes, v.periodos_pagados, v.periodos_adeudados,
              v.monto_adeudado, v.pagado_hasta, v.pagos_por_validar, v.suscripcion_anterior_id, v.proxima_mantencion,
              v.ultima_mantencion, s.version_condiciones
       FROM v_suscripciones_estado v JOIN suscripciones s ON s.id = v.suscripcion_id
       WHERE v.instalacion_id = $1 ORDER BY v.fecha_inicio, v.suscripcion_id`, [id]),
    pool.query(
      `SELECT m.id, m.tipo, m.estado, m.fecha_programada, m.fecha_realizada, m.numero_en_plan, m.valor_servicio,
              t.nombre AS tecnico, s.codigo AS suscripcion_codigo, ts.nombre AS plan
       FROM mantenciones m
       LEFT JOIN tecnicos t ON t.id = m.tecnico_id
       LEFT JOIN suscripciones s ON s.id = m.suscripcion_id
       LEFT JOIN tipos_suscripcion ts ON ts.id = s.tipo_suscripcion_id
       WHERE m.instalacion_id = $1 ORDER BY COALESCE(m.fecha_realizada, m.fecha_programada) DESC`, [id]),
  ]);
  res.json({ ...inst, equipos: equipos.rows, documentos: documentos.rows, suscripciones: suscripciones.rows, mantenciones: mantenciones.rows });
});

router.put('/:id', async (req, res) => {
  const d = datosInstalacion(req.body);
  const cols = Object.keys(d);
  const { rowCount } = await pool.query(
    `UPDATE instalaciones SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
    [...Object.values(d), req.params.id]
  );
  if (!rowCount) throw new ErrorHttp(404, 'Instalación no encontrada');
  res.json({ ok: true });
});

// Nada se borra: la instalación se desactiva (o reactiva). No se puede desactivar con suscripción vigente.
router.post('/:id/activa', async (req, res) => {
  const activa = req.body?.activa === true;
  if (!activa) {
    const { rowCount } = await pool.query("SELECT 1 FROM suscripciones WHERE instalacion_id = $1 AND estado = 'vigente'", [req.params.id]);
    if (rowCount) throw new ErrorHttp(409, 'La instalación tiene una suscripción vigente. Ciérrala antes de desactivarla.');
  }
  const { rowCount } = await pool.query('UPDATE instalaciones SET activa = $1 WHERE id = $2', [activa, req.params.id]);
  if (!rowCount) throw new ErrorHttp(404, 'Instalación no encontrada');
  res.json({ activa });
});

router.post('/:id/equipos', async (req, res) => {
  const { rows: [i] } = await pool.query('SELECT id, fecha_instalacion FROM instalaciones WHERE id = $1', [req.params.id]);
  if (!i) throw new ErrorHttp(404, 'Instalación no encontrada');
  const e = datosEquipo(req.body);
  const r = await insertar(pool, 'equipos', { ...e, fecha_instalacion: e.fecha_instalacion ?? i.fecha_instalacion }, { instalacion_id: i.id });
  res.status(201).json({ id: r.id });
});

// Reemplazo de equipo (062 a 065): el anterior queda retirado con su motivo y el nuevo enlazado a él
router.post('/:id/equipos/:equipo/reemplazar', async (req, res) => {
  const { motivo, fecha_retiro, mantencion_id, notas, nuevo } = req.body;
  if (!motivo?.trim()) throw new ErrorHttp(400, 'Indica el motivo del cambio');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_retiro || '')) throw new ErrorHttp(400, 'Indica la fecha de retiro');
  const datosNuevo = datosEquipo(nuevo || {});
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [viejo] } = await db.query(
      'SELECT * FROM equipos WHERE id = $1 AND instalacion_id = $2 AND activo FOR UPDATE', [req.params.equipo, req.params.id]);
    if (!viejo) throw new ErrorHttp(404, 'El equipo no existe o ya fue retirado');
    if (mantencion_id) {
      const { rowCount } = await db.query('SELECT 1 FROM mantenciones WHERE id = $1 AND instalacion_id = $2', [mantencion_id, req.params.id]);
      if (!rowCount) throw new ErrorHttp(400, 'La mantención no corresponde a esta instalación');
    }
    await db.query(
      `UPDATE equipos SET activo = false, fecha_retiro = $1, motivo_retiro = $2, mantencion_retiro_id = $3 WHERE id = $4`,
      [fecha_retiro, notas?.trim() ? `${motivo.trim()} · ${notas.trim()}` : motivo.trim(), mantencion_id || null, viejo.id]);
    const r = await insertar(db, 'equipos', { ...datosNuevo, fecha_instalacion: datosNuevo.fecha_instalacion ?? fecha_retiro },
      { instalacion_id: viejo.instalacion_id, reemplaza_a_id: viejo.id });
    await db.query('COMMIT');
    res.status(201).json({ id: r.id, retirado: viejo.id });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// ---------- Documentos (058) en Supabase Storage, bucket privado "documentos" ----------
// 1) El navegador pide una URL firmada y sube el archivo directo a Storage; 2) se registra el documento.
router.post('/:id/documentos/subida', async (req, res) => {
  const archivo = String(req.body?.archivo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  if (!archivo) throw new ErrorHttp(400, 'Falta el archivo');
  const ruta = `instalaciones/${req.params.id}/${Date.now()}-${archivo}`;
  const { data, error } = await supabase.storage.from('documentos').createSignedUploadUrl(ruta);
  if (error) throw error;
  res.json({ ruta, url: data.signedUrl, token: data.token });
});

router.post('/:id/documentos', async (req, res) => {
  const { nombre, tipo, ruta, visible_cliente } = req.body;
  if (!nombre?.trim()) throw new ErrorHttp(400, 'Indica el nombre del documento');
  if (!TIPOS_DOCUMENTO.includes(tipo)) throw new ErrorHttp(400, 'Tipo de documento no válido');
  if (!String(ruta || '').startsWith(`instalaciones/${req.params.id}/`)) throw new ErrorHttp(400, 'Ruta de archivo no válida');
  // Las fotos e informes de una mantención quedan ligados a ella (y a la instalación)
  let mantencion = null;
  if (req.body.mantencion_id) {
    const { rows: [m] } = await pool.query('SELECT id FROM mantenciones WHERE id = $1 AND instalacion_id = $2', [Number(req.body.mantencion_id) || 0, req.params.id]);
    if (!m) throw new ErrorHttp(400, 'La mantención no corresponde a esta instalación');
    mantencion = m.id;
  }
  const { rows: [d] } = await pool.query(
    `INSERT INTO documentos (instalacion_id, mantencion_id, tipo, nombre, storage_path, visible_cliente, subido_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.params.id, mantencion, tipo, nombre.trim(), ruta, visible_cliente === true, req.usuario.id]);
  res.status(201).json(d);
});

router.get('/:id/documentos/:doc/url', async (req, res) => {
  const { rows: [d] } = await pool.query('SELECT storage_path FROM documentos WHERE id = $1 AND instalacion_id = $2', [req.params.doc, req.params.id]);
  if (!d) throw new ErrorHttp(404, 'Documento no encontrado');
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 300);
  if (error) throw error;
  res.json({ url: data.signedUrl });
});

router.patch('/:id/documentos/:doc', async (req, res) => {
  const { rowCount } = await pool.query('UPDATE documentos SET visible_cliente = $1 WHERE id = $2 AND instalacion_id = $3',
    [req.body?.visible_cliente === true, req.params.doc, req.params.id]);
  if (!rowCount) throw new ErrorHttp(404, 'Documento no encontrado');
  res.json({ ok: true });
});

router.delete('/:id/documentos/:doc', async (req, res) => {
  const { rows: [d] } = await pool.query('DELETE FROM documentos WHERE id = $1 AND instalacion_id = $2 RETURNING storage_path', [req.params.doc, req.params.id]);
  if (!d) throw new ErrorHttp(404, 'Documento no encontrado');
  await supabase.storage.from('documentos').remove([d.storage_path]).catch(() => {});
  res.json({ ok: true });
});

// ---------- Asistente de alta (066 a 071): cliente + instalación + equipos + suscripción ----------
router.post('/alta', async (req, res) => {
  const { cliente, instalacion, equipos = [], suscripcion, invitar } = req.body;
  const datosInst = datosInstalacion(instalacion || {});
  const listaEquipos = (Array.isArray(equipos) ? equipos : []).map(datosEquipo);

  const db = await pool.connect();
  let clienteId;
  let creada;
  try {
    await db.query('BEGIN');
    if (cliente?.id) {
      const { rows: [c] } = await db.query('SELECT id, activo FROM clientes WHERE id = $1', [cliente.id]);
      if (!c) throw new ErrorHttp(400, 'El cliente elegido no existe');
      if (!c.activo) throw new ErrorHttp(400, 'El cliente elegido está desactivado');
      clienteId = c.id;
    } else {
      const rut = cliente?.rut ? normalizarRut(cliente.rut) : null;
      if (cliente?.rut && !rut) throw new ErrorHttp(400, 'El RUT del cliente no es válido');
      if (!cliente?.nombre?.trim()) throw new ErrorHttp(400, 'El nombre del cliente es obligatorio');
      const email = cliente.email ? String(cliente.email).trim().toLowerCase() : null;
      if (email && !correoValido(email)) throw new ErrorHttp(400, 'El correo del cliente no es válido');
      try {
        const c = await insertar(db, 'clientes', {
          rut, nombre: cliente.nombre.trim(), es_empresa: cliente.es_empresa === true, email,
          telefono: vacio(cliente.telefono?.trim()), direccion: vacio(cliente.direccion?.trim()),
          localidad_id: vacio(cliente.localidad_id), origen: vacio(cliente.origen?.trim()), notas: vacio(cliente.notas?.trim()),
        });
        clienteId = c.id;
      } catch (err) {
        if (err.code === '23505') throw new ErrorHttp(409, err.constraint === 'clientes_email_uk' ? 'Ya existe un cliente con ese correo: elígelo como "Cliente existente"' : 'Ya existe un cliente con ese RUT: elígelo como "Cliente existente"');
        throw err;
      }
    }
    creada = await insertar(db, 'instalaciones', datosInst, { cliente_id: clienteId });
    for (const e of listaEquipos) {
      await insertar(db, 'equipos', { ...e, fecha_instalacion: e.fecha_instalacion ?? creada.fecha_instalacion }, { instalacion_id: creada.id });
    }
    let sus = null;
    if (suscripcion?.tipo_suscripcion_id) {
      const { rows: [s] } = await db.query(
        `INSERT INTO suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio, meses_gratis, creada_por)
         VALUES ($1, $2, COALESCE($3::date, fn_hoy()), COALESCE($4::smallint, 0), $5) RETURNING id, codigo`,
        [creada.id, suscripcion.tipo_suscripcion_id, vacio(suscripcion.fecha_inicio), vacio(suscripcion.meses_gratis), req.usuario.id]);
      sus = s;
    }
    await db.query('COMMIT');
    // La invitación va después de guardar: si el correo falla, la instalación igual queda creada
    let invitacion = null;
    // Si el cliente ya usa el portal, se le avisa de su nueva instalación
    const { rows: [cli] } = await pool.query('SELECT nombre, email FROM clientes WHERE id = $1', [clienteId]);
    if (cli?.email && (await estadoAcceso(cli.email)).estado === 'activo') {
      await enviarCorreo({
        para: cli.email,
        asunto: `Agregamos ${creada.nombre || 'tu nueva instalación'} a Syntia`,
        titulo: `¡Hola, ${primerNombre(cli.nombre)}!`,
        parrafos: [`Registramos tu nueva instalación ${creada.nombre || creada.codigo}.`, 'Entra a Syntia para verla y contratar su plan de mantención.'],
        boton: { texto: 'Ver mi instalación', url: `${urlApp(req)}/portal/instalaciones/${creada.id}` },
      }).catch((err) => console.error('No se pudo avisar la nueva instalación:', err.message));
      invitacion = { enviada: true, correo: cli.email, aviso: true };
    } else if (invitar) {
      invitacion = await invitarCliente(req, clienteId, { instalacion: creada.nombre || creada.codigo }).then((r) => ({ enviada: true, correo: r.correo }))
        .catch((err) => ({ enviada: false, error: err.message }));
    }
    const { rows: [mant] } = await pool.query("SELECT count(*)::int AS n FROM mantenciones WHERE instalacion_id = $1 AND estado = 'programada'", [creada.id]);
    res.status(201).json({ cliente_id: clienteId, instalacion_id: creada.id, codigo: creada.codigo, suscripcion: sus, mantenciones: mant.n, invitacion });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
});

export default router;
