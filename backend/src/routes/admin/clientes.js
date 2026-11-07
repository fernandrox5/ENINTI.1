// T-22 · RF-03: clientes — listado con filtros, alta, edición, ficha y acceso al portal (mockups 047 a 054)
import { Router } from 'express';
import { pool } from '../../config/db.js';
import { normalizarRut, correoValido, ErrorHttp } from '../../utils/validar.js';
import { invitarCliente } from '../../services/invitaciones.js';

const router = Router();
const POR_PAGINA = 20;

// Los ids son numéricos: cualquier otro valor responde 404
router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next(new ErrorHttp(404, 'Cliente no encontrado'))));

// Estado resumido de las suscripciones de cada cliente (columna "Suscripciones" del 047)
const RESUMEN = `
  WITH v AS (
    SELECT v.cliente_id,
           sum(v.monto_adeudado)::int                                           AS deuda,
           max(v.periodos_adeudados)::int                                       AS max_adeudados,
           count(*) FILTER (WHERE v.periodos_adeudados > 0)::int                AS con_deuda,
           sum(v.pagos_por_validar)::int                                        AS por_validar,
           count(*) FILTER (WHERE v.estado = 'vigente')::int                    AS vigentes,
           min(v.dias_restantes) FILTER (WHERE v.estado = 'vigente')            AS dias_min
    FROM v_suscripciones_estado v GROUP BY v.cliente_id
  ), g AS (
    SELECT DISTINCT ON (cliente_id) cliente_id, tipo, fecha FROM gestiones ORDER BY cliente_id, fecha DESC
  )`;

function datosCliente(b) {
  const rut = b.rut ? normalizarRut(b.rut) : null;
  if (b.rut && !rut) throw new ErrorHttp(400, 'El RUT no es válido');
  if (!b.nombre?.trim()) throw new ErrorHttp(400, 'El nombre es obligatorio');
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  if (email && !correoValido(email)) throw new ErrorHttp(400, 'El correo no es válido');
  return [rut, b.nombre.trim(), b.es_empresa === true, email, b.telefono?.trim() || null, b.direccion?.trim() || null,
    b.localidad_id || null, b.origen?.trim() || null, b.notas?.trim() || null];
}

function duplicado(err) {
  if (err.code !== '23505') return err;
  return new ErrorHttp(409, err.constraint === 'clientes_email_uk' ? 'Ya existe un cliente con ese correo' : 'Ya existe un cliente con ese RUT');
}

router.get('/localidades', async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, comuna FROM localidades ORDER BY id');
  res.json(rows);
});

// Listado: ?q= nombre/RUT/correo · ?localidad= · ?filtro=activos|deuda|inactivos|todos · ?pagina=
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filtro = ['activos', 'deuda', 'inactivos', 'todos'].includes(req.query.filtro) ? req.query.filtro : 'activos';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const condiciones = ['TRUE'];
  const params = [];
  if (q) {
    params.push(`%${q}%`, `%${q.replace(/[.\s]/g, '')}%`);
    condiciones.push(`(c.nombre ILIKE $${params.length - 1} OR c.email ILIKE $${params.length - 1} OR c.rut ILIKE $${params.length})`);
  }
  if (req.query.localidad) { params.push(req.query.localidad); condiciones.push(`c.localidad_id = $${params.length}`); }
  if (filtro === 'activos') condiciones.push('c.activo');
  if (filtro === 'inactivos') condiciones.push('NOT c.activo');
  if (filtro === 'deuda') condiciones.push('COALESCE(v.deuda, 0) > 0');

  const base = `${RESUMEN}
    SELECT c.id, c.nombre, c.rut, c.activo, l.nombre AS localidad,
           CASE WHEN c.perfil_id IS NULL THEN 'sin_acceso' WHEN u.email_confirmed_at IS NULL THEN 'invitado' ELSE 'activo' END AS portal,
           (SELECT count(*)::int FROM instalaciones i WHERE i.cliente_id = c.id) AS instalaciones,
           COALESCE(v.deuda, 0) AS deuda, COALESCE(v.max_adeudados, 0) AS max_adeudados, COALESCE(v.con_deuda, 0) AS con_deuda,
           COALESCE(v.por_validar, 0) AS por_validar, COALESCE(v.vigentes, 0) AS vigentes, v.dias_min,
           g.tipo AS gestion_tipo, g.fecha AS gestion_fecha
    FROM clientes c
    LEFT JOIN localidades l ON l.id = c.localidad_id
    LEFT JOIN auth.users u ON u.id = c.perfil_id
    LEFT JOIN v ON v.cliente_id = c.id
    LEFT JOIN g ON g.cliente_id = c.id
    WHERE ${condiciones.join(' AND ')}`;
  const { rows: [{ total }] } = await pool.query(`SELECT count(*)::int AS total FROM (${base}) t`, params);
  const { rows } = await pool.query(`${base} ORDER BY c.nombre LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, params);
  const { rows: [conteo] } = await pool.query(
    `${RESUMEN} SELECT count(*) FILTER (WHERE c.activo)::int AS activos, count(*) FILTER (WHERE NOT c.activo)::int AS inactivos,
            count(*) FILTER (WHERE COALESCE(v.deuda, 0) > 0)::int AS deuda, count(*)::int AS todos
     FROM clientes c LEFT JOIN v ON v.cliente_id = c.id`
  );
  res.json({ clientes: rows, total, pagina, por_pagina: POR_PAGINA, conteo });
});

// Ficha completa con todas sus pestañas (los volúmenes por cliente son chicos)
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const { rows: [cliente] } = await pool.query(
    `SELECT c.*, l.nombre AS localidad, p.email AS correo_acceso, u.last_sign_in_at AS ultimo_ingreso,
            u.email_confirmed_at AS acceso_activado, u.invited_at AS invitado_en
     FROM clientes c
     LEFT JOIN localidades l ON l.id = c.localidad_id
     LEFT JOIN perfiles p ON p.id = c.perfil_id
     LEFT JOIN auth.users u ON u.id = c.perfil_id
     WHERE c.id = $1`,
    [id]
  );
  if (!cliente) throw new ErrorHttp(404, 'Cliente no encontrado');

  const [instalaciones, suscripciones, pagos, solicitudes, gestiones, resumen] = await Promise.all([
    pool.query(
      `SELECT i.id, i.codigo, i.nombre, i.direccion, i.tipo_sistema, i.potencia_kwp, i.activa, l.nombre AS localidad,
              v.suscripcion_id, v.codigo AS suscripcion_codigo, v.estado, v.dias_restantes, v.periodos_adeudados, v.pagos_por_validar
       FROM instalaciones i
       LEFT JOIN localidades l ON l.id = i.localidad_id
       LEFT JOIN v_suscripciones_estado v ON v.instalacion_id = i.id AND v.estado = 'vigente'
       WHERE i.cliente_id = $1 ORDER BY i.codigo`, [id]),
    pool.query(
      `SELECT v.suscripcion_id AS id, v.codigo, v.estado, v.instalacion_id, v.instalacion_nombre, v.instalacion_codigo,
              v.tipo_nombre, v.fecha_inicio, v.fecha_termino, v.fecha_cierre, v.motivo_cierre, v.dias_restantes,
              v.periodos_adeudados, v.monto_adeudado
       FROM v_suscripciones_estado v WHERE v.cliente_id = $1
       ORDER BY (v.estado = 'vigente') DESC, v.fecha_inicio DESC`, [id]),
    pool.query(
      `SELECT p.id, p.periodo, p.monto, p.medio_pago, p.estado, (p.fecha_pago AT TIME ZONE 'America/Santiago')::date AS fecha_pago,
              p.created_at, i.nombre AS instalacion, i.codigo AS instalacion_codigo, s.codigo AS suscripcion_codigo
       FROM pagos p JOIN suscripciones s ON s.id = p.suscripcion_id JOIN instalaciones i ON i.id = s.instalacion_id
       WHERE i.cliente_id = $1 ORDER BY p.periodo DESC, p.id DESC`, [id]),
    pool.query(
      `SELECT so.id, so.tipo, so.prioridad, so.estado, so.canal, so.descripcion, so.created_at, i.nombre AS instalacion
       FROM solicitudes so LEFT JOIN instalaciones i ON i.id = so.instalacion_id
       WHERE so.cliente_id = $1 ORDER BY so.created_at DESC`, [id]),
    pool.query(
      `SELECT g.id, g.tipo, g.motivo, g.resultado, g.fecha, p.nombre AS realizada_por
       FROM gestiones g LEFT JOIN perfiles p ON p.id = g.realizada_por
       WHERE g.cliente_id = $1 ORDER BY g.fecha DESC`, [id]),
    pool.query(
      `SELECT COALESCE(sum(monto_adeudado), 0)::int AS deuda, COALESCE(sum(total_pagado), 0)::int AS total_pagado
       FROM v_suscripciones_estado WHERE cliente_id = $1`, [id]),
  ]);
  const ultimoPago = pagos.rows.find((p) => p.estado === 'pagado' || p.estado === 'pendiente') ?? null;
  res.json({
    ...cliente,
    resumen: { ...resumen.rows[0], ultimo_pago: ultimoPago },
    instalaciones: instalaciones.rows,
    suscripciones: suscripciones.rows,
    pagos: pagos.rows,
    solicitudes: solicitudes.rows,
    gestiones: gestiones.rows,
  });
});

router.post('/', async (req, res) => {
  try {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clientes (rut, nombre, es_empresa, email, telefono, direccion, localidad_id, origen, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      datosCliente(req.body)
    );
    res.status(201).json(c);
  } catch (err) {
    throw duplicado(err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE clientes SET rut = $1, nombre = $2, es_empresa = $3, email = $4, telefono = $5, direccion = $6,
              localidad_id = $7, origen = $8, notas = $9
       WHERE id = $10`,
      [...datosCliente(req.body), req.params.id]
    );
    if (!rowCount) throw new ErrorHttp(404, 'Cliente no encontrado');
    res.json({ ok: true });
  } catch (err) {
    throw duplicado(err);
  }
});

// Nada se borra: el cliente se desactiva (o reactiva). Desactivarlo no cierra sus suscripciones.
router.post('/:id/activo', async (req, res) => {
  const activo = req.body?.activo === true;
  const { rowCount } = await pool.query('UPDATE clientes SET activo = $1 WHERE id = $2', [activo, req.params.id]);
  if (!rowCount) throw new ErrorHttp(404, 'Cliente no encontrado');
  res.json({ activo });
});

// Enviar o reenviar la invitación al portal (el cliente activa su cuenta y crea su contraseña)
router.post('/:id/invitar', async (req, res) => {
  res.json(await invitarCliente(req, req.params.id));
});

// Registrar gestión (llamada, WhatsApp, correo, visita) para retener o recuperar al cliente
router.post('/:id/gestiones', async (req, res) => {
  const { tipo, motivo, resultado, suscripcion_id, fecha } = req.body;
  if (!['llamada', 'whatsapp', 'email', 'visita', 'otro'].includes(tipo)) throw new ErrorHttp(400, 'Elige el tipo de gestión');
  if (!motivo?.trim()) throw new ErrorHttp(400, 'Indica el motivo');
  const { rows: [g] } = await pool.query(
    `INSERT INTO gestiones (cliente_id, suscripcion_id, tipo, motivo, resultado, fecha, realizada_por)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7) RETURNING id`,
    [req.params.id, suscripcion_id || null, tipo, motivo.trim(), resultado?.trim() || null, fecha || null, req.usuario.id]
  );
  res.status(201).json(g);
});

export default router;
