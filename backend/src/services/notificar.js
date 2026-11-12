// Avisos automáticos por correo: un correo por cada cosa que pasa, una sola vez.
//   Al cliente:        suscripción activa, pago recibido, pago pendiente, suscripción cerrada,
//                      por vencer (15 días antes), vencida, mantención agendada, recordatorio del día
//                      anterior e informe listo.
//   Al administrador:  suscripción nueva, pago pendiente, suscripción cerrada, por vencer, vencida y
//                      solicitud nueva (además de la campana de Syntia).
//   Al técnico:        visita asignada y recordatorio del día anterior.
// Cada aviso queda en la tabla notificaciones (historial en Configuración → Correos). Si falla el correo,
// la acción que lo originó sigue igual: los avisos nunca la detienen.
import { pool } from '../config/db.js';
import { enviarCorreo, plantilla } from './correo.js';
import { PRODUCCION, primerNombre, urlApp } from './invitaciones.js';

const DESARROLLO = 'https://syntia-git-develop-fernandos-projects-7f551f0e.vercel.app';
const correosActivos = () => process.env.MAIL_ENABLED !== 'false';

// Dirección de la página para los botones de los correos
function base(req) {
  const b = req ? urlApp(req) : process.env.APP_URL?.replace(/\/$/, '') || (process.env.VERCEL_ENV === 'production' ? PRODUCCION : DESARROLLO);
  return b;
}
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : '');
const fechaLarga = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const hora = (h) => (h ? ` a las ${String(h).slice(0, 5)}` : '');
const TIPO_VISITA = { preventiva: 'Mantención preventiva', correctiva: 'Reparación', emergencia: 'Visita de emergencia' };

// ---------- Plantillas: cada evento dice a quién le llega y qué dice ----------
// Cada función recibe los datos (d) y la URL base (u) y devuelve { asunto, titulo, parrafos, boton }
export const PLANTILLAS = {
  suscripcion_contratada: {
    cuando: 'El cliente contrata una suscripción desde su portal',
    cliente: (d, u) => ({
      asunto: 'Tu suscripción está activa', titulo: `¡Listo, ${primerNombre(d.cliente)}!`,
      parrafos: [`Tu suscripción al ${d.plan} para ${d.instalacion} ya está activa.`,
        `Se cobra ${pesos(d.monto)} cada mes, el día ${d.dia_cobro}. Incluye ${d.incluidas} ${d.incluidas === 1 ? 'mantención' : 'mantenciones'}: pídelas desde tu portal cuando las necesites.`],
      boton: { texto: 'Ver mi suscripción', url: `${u}/portal/pagos` },
    }),
    admin: (d, u) => ({
      asunto: `Nueva suscripción: ${d.cliente}`, titulo: 'Nueva suscripción',
      parrafos: [`${d.cliente} contrató el ${d.plan} para ${d.instalacion} (${pesos(d.monto)} al mes).`],
      boton: { texto: 'Ver la suscripción', url: `${u}/admin/suscripciones/${d.suscripcion_id}` },
    }),
  },
  pago_recibido: {
    cuando: 'Se recibe el pago del mes (tarjeta, Flow o registrado por ENINTI)',
    cliente: (d, u) => ({
      asunto: 'Recibimos tu pago', titulo: `Gracias, ${primerNombre(d.cliente)}`,
      parrafos: [`Recibimos tu pago de ${pesos(d.monto)} por la suscripción de ${d.instalacion}.`,
        d.pagado_hasta ? `Estás al día hasta el ${fecha(d.pagado_hasta)}.` : ''].filter(Boolean),
      boton: { texto: 'Ver mis pagos', url: `${u}/portal/pagos` },
    }),
  },
  cobro_fallido: {
    cuando: 'El pago del mes queda pendiente (la tarjeta no pasó o el cliente paga con enlace)',
    cliente: (d, u) => ({
      asunto: d.tarjeta ? 'No pudimos cobrar tu tarjeta' : 'Ya puedes pagar tu mes', titulo: d.tarjeta ? 'No pudimos cobrar tu tarjeta' : 'Tu pago del mes',
      parrafos: [d.tarjeta ? `Intentamos cobrar ${pesos(d.monto)} de tu suscripción de ${d.instalacion} y la tarjeta no pasó.` : `El pago de ${pesos(d.monto)} de tu suscripción de ${d.instalacion} ya está disponible.`,
        `Tienes hasta el ${fecha(d.limite)} para pagar desde tu portal. Si no, la suscripción se cerrará.`],
      boton: { texto: 'Pagar ahora', url: `${u}/portal/pagos` },
    }),
    admin: (d, u) => ({
      asunto: `Pago pendiente: ${d.cliente}`, titulo: 'Pago pendiente',
      parrafos: [`${d.tarjeta ? 'No se pudo cobrar la tarjeta de' : 'Está pendiente el pago del mes de'} ${d.cliente} (${d.instalacion}, ${pesos(d.monto)}).`,
        `Tiene hasta el ${fecha(d.limite)}. Si no paga, la suscripción se cierra sola.`],
      boton: { texto: 'Ver al cliente', url: `${u}/admin/clientes/${d.cliente_id}` },
    }),
  },
  suscripcion_cerrada: {
    cuando: 'La suscripción se cierra (falta de pago o el cliente la cancela)',
    cliente: (d, u) => (d.motivo === 'Falta de pago' ? {
      asunto: 'Tu suscripción se cerró', titulo: 'Tu suscripción se cerró',
      parrafos: [`Como no recibimos el pago de ${d.instalacion}, tu suscripción se cerró.`, 'Puedes volver a contratarla cuando quieras desde tu portal.'],
      boton: { texto: 'Ver planes', url: `${u}/portal/planes` },
    } : {
      asunto: 'Cancelaste tu suscripción', titulo: 'Tu suscripción quedó cancelada',
      parrafos: [`Cancelaste la suscripción de ${d.instalacion}. Sigues cubierto hasta el ${fecha(d.cierre)} y no se te cobrará más.`, 'Si cambias de opinión, puedes volver a contratarla desde tu portal.'],
      boton: { texto: 'Ir a mi portal', url: `${u}/portal` },
    }),
    admin: (d, u) => ({
      asunto: `Suscripción cerrada: ${d.cliente}`, titulo: 'Suscripción cerrada',
      parrafos: [`La suscripción de ${d.cliente} (${d.instalacion}) se cerró. Motivo: ${d.motivo}.`],
      boton: { texto: 'Ver al cliente', url: `${u}/admin/clientes/${d.cliente_id}` },
    }),
  },
  vencimiento_proximo: {
    cuando: '15 días antes de que venza la suscripción',
    cliente: (d, u) => ({
      asunto: 'Tu suscripción vence pronto', titulo: 'Tu suscripción vence pronto',
      parrafos: [`La suscripción de ${d.instalacion} vence el ${fecha(d.fecha_termino)}.`, 'Para seguir con tus mantenciones, renuévala desde tu portal.'],
      boton: { texto: 'Renovar', url: `${u}/portal/planes` },
    }),
    admin: (d, u) => ({
      asunto: `Vence en 15 días: ${d.cliente}`, titulo: 'Suscripción por vencer',
      parrafos: [`La suscripción de ${d.cliente} (${d.instalacion}) vence el ${fecha(d.fecha_termino)}. Conviene llamarlo para que la renueve.`],
      boton: { texto: 'Ver al cliente', url: `${u}/admin/clientes/${d.cliente_id}` },
    }),
  },
  suscripcion_vencida: {
    cuando: 'La suscripción venció y no se renovó',
    cliente: (d, u) => ({
      asunto: 'Tu suscripción venció', titulo: 'Tu suscripción venció',
      parrafos: [`La suscripción de ${d.instalacion} venció el ${fecha(d.fecha_termino)}.`, 'Puedes renovarla desde tu portal para seguir con tus mantenciones.'],
      boton: { texto: 'Renovar', url: `${u}/portal/planes` },
    }),
    admin: (d, u) => ({
      asunto: `No renovó: ${d.cliente}`, titulo: 'Suscripción vencida',
      parrafos: [`${d.cliente} no renovó la suscripción de ${d.instalacion} (venció el ${fecha(d.fecha_termino)}).`],
      boton: { texto: 'Ver al cliente', url: `${u}/admin/clientes/${d.cliente_id}` },
    }),
  },
  mantencion_agendada: {
    cuando: 'ENINTI agenda una visita o asigna el técnico',
    cliente: (d, u) => ({
      asunto: 'Tu mantención está agendada', titulo: 'Tu mantención está agendada',
      parrafos: [`${TIPO_VISITA[d.tipo] ?? 'Visita'} de ${d.instalacion}: ${fechaLarga(d.fecha_programada)}${hora(d.hora_inicio)}.`,
        d.tecnico ? `Te visitará ${d.tecnico}.` : 'Te avisaremos quién te visitará.'],
      boton: { texto: 'Ver detalle', url: `${u}/portal/mantenciones/${d.mantencion_id}` },
    }),
    tecnico: (d, u) => ({
      asunto: `Nueva visita: ${d.instalacion}`, titulo: 'Tienes una visita asignada',
      parrafos: [`${TIPO_VISITA[d.tipo] ?? 'Visita'} en ${d.instalacion}: ${fechaLarga(d.fecha_programada)}${hora(d.hora_inicio)}.`,
        `Dirección: ${d.direccion}. Cliente: ${d.cliente}${d.telefono ? `, ${d.telefono}` : ''}.`],
      boton: { texto: 'Ver la visita', url: `${u}/tecnico/visitas/${d.mantencion_id}` },
    }),
  },
  mantencion_proxima: {
    cuando: 'El día anterior a la visita',
    cliente: (d, u) => ({
      asunto: 'Mañana es tu mantención', titulo: 'Mañana es tu mantención',
      parrafos: [`Mañana${hora(d.hora_inicio)} vamos a ${d.instalacion}${d.tecnico ? ` (te visita ${d.tecnico})` : ''}.`, 'Si no vas a estar, avísanos por WhatsApp para cambiar la fecha.'],
      boton: { texto: 'Ver detalle', url: `${u}/portal/mantenciones/${d.mantencion_id}` },
    }),
    tecnico: (d, u) => ({
      asunto: `Mañana: ${d.instalacion}`, titulo: 'Recordatorio de visita',
      parrafos: [`Mañana${hora(d.hora_inicio)} tienes una visita en ${d.instalacion}, ${d.direccion}.`, `Cliente: ${d.cliente}${d.telefono ? `, ${d.telefono}` : ''}.`],
      boton: { texto: 'Ver la visita', url: `${u}/tecnico/visitas/${d.mantencion_id}` },
    }),
  },
  informe_listo: {
    cuando: 'El técnico envía el informe de la visita',
    cliente: (d, u) => ({
      asunto: 'Tu informe de mantención está listo', titulo: 'Tu informe está listo',
      parrafos: [`${d.tecnico ?? 'El técnico'} terminó la visita a ${d.instalacion} el ${fecha(d.fecha_realizada)}.`, 'Revisa lo que se hizo, las fotos y cuéntanos cómo te fue.'],
      boton: { texto: 'Ver el informe', url: `${u}/portal/mantenciones/${d.mantencion_id}` },
    }),
  },
  solicitud_nueva: {
    cuando: 'Un cliente pide una mantención o reporta una emergencia en su portal',
    admin: (d, u) => ({
      asunto: d.tipo === 'emergencia' ? `Emergencia: ${d.cliente}` : `Pedido de mantención: ${d.cliente}`,
      titulo: d.tipo === 'emergencia' ? 'Nueva emergencia' : 'Nuevo pedido de mantención',
      parrafos: [`${d.cliente}${d.instalacion ? ` (${d.instalacion})` : ''} escribió: "${d.descripcion}"`],
      boton: { texto: 'Atender', url: `${u}/admin/solicitudes?id=${d.solicitud_id}` },
    }),
  },
};
const ROLES = { cliente: 'Cliente', admin: 'Administrador', tecnico: 'Técnico' };

// ---------- Datos de cada evento ----------
async function emailAdmin() {
  const { rows: [c] } = await pool.query("SELECT valor FROM configuracion WHERE clave = 'email_admin'");
  return c?.valor?.trim() || null;
}
async function datosSuscripcion(id) {
  const { rows: [d] } = await pool.query(
    `SELECT v.suscripcion_id, v.cliente_id, v.cliente_nombre AS cliente, v.cliente_email, coalesce(v.instalacion_nombre, v.instalacion_codigo) AS instalacion,
            v.tipo_nombre AS plan, v.monto_pactado AS monto, extract(day FROM v.fecha_inicio)::int AS dia_cobro, v.fecha_termino, v.pagado_hasta,
            v.motivo_cierre AS motivo, v.fecha_cierre AS cierre,
            (SELECT ceil(t.mantenciones_por_anio * t.duracion_meses / 12.0)::int FROM tipos_suscripcion t WHERE t.id = v.tipo_suscripcion_id) AS incluidas,
            (SELECT string_agg(to_char(m.fecha_programada, 'DD-MM-YYYY'), ', ' ORDER BY m.fecha_programada) FROM mantenciones m
               WHERE m.suscripcion_id = v.suscripcion_id AND m.estado = 'programada') AS mantenciones
     FROM v_suscripciones_estado v WHERE v.suscripcion_id = $1`, [id]);
  return d;
}
async function datosMantencion(id) {
  const { rows: [d] } = await pool.query(
    `SELECT m.id AS mantencion_id, m.tipo, m.fecha_programada, m.hora_inicio, m.fecha_realizada, m.suscripcion_id,
            coalesce(i.nombre, i.codigo) AS instalacion, i.direccion || coalesce(', ' || l.nombre, '') AS direccion,
            c.id AS cliente_id, c.nombre AS cliente, c.email AS cliente_email, c.telefono, t.nombre AS tecnico, t.email AS tecnico_email
     FROM mantenciones m JOIN instalaciones i ON i.id = m.instalacion_id JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN localidades l ON l.id = i.localidad_id LEFT JOIN tecnicos t ON t.id = m.tecnico_id WHERE m.id = $1`, [id]);
  return d;
}

// ---------- Envío ----------
// Arma los correos del evento para cada destinatario, los guarda (sin repetir el mismo aviso) y los envía.
async function despachar(evento, d, { u, fechaEvento, tipoBd = evento }) {
  const p = PLANTILLAS[evento];
  const admin = await emailAdmin();
  const destinos = [
    p.cliente && d.cliente_email && ['cliente', d.cliente_email],
    p.admin && admin && ['admin', admin],
    p.tecnico && d.tecnico_email && ['tecnico', d.tecnico_email],
  ].filter(Boolean);
  const resultado = [];
  for (const [rol, para] of destinos) {
    const correo = p[rol](d, u);
    let id = null;
    try {
      // Una sola vez: mismo evento, misma suscripción o visita, misma fecha y mismo destinatario
      const { rows: [ya] } = await pool.query(
        `SELECT id FROM notificaciones WHERE tipo_evento::text = $1 AND coalesce(suscripcion_id, 0) = coalesce($2::bigint, 0)
           AND coalesce(mantencion_id, 0) = coalesce($3::bigint, 0) AND fecha_evento = $4::date AND destinatario = $5`,
        [tipoBd, d.suscripcion_id ?? null, d.mantencion_id ?? null, fechaEvento, para]);
      if (ya) continue;
      const { rows: [n] } = await pool.query(
        `INSERT INTO notificaciones (tipo_evento, suscripcion_id, mantencion_id, cliente_id, fecha_evento, destinatario, asunto, mensaje, para, boton_texto, boton_url)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING RETURNING id`,
        [tipoBd, d.suscripcion_id ?? null, d.mantencion_id ?? null, d.cliente_id ?? null, fechaEvento, para, correo.asunto,
         correo.parrafos.join('\n\n'), rol, correo.boton?.texto ?? null, correo.boton?.url ?? null]);
      if (!n) continue;
      id = n.id;
    } catch (err) {
      // Sin el script 08 la tabla no tiene estos tipos de aviso: el correo igual se envía, sin historial
      console.error(`Aviso ${evento} sin historial:`, err.message);
    }
    if (!correosActivos()) { resultado.push({ rol, para, estado: 'pendiente' }); continue; }
    try {
      await enviarCorreo({ para, asunto: correo.asunto, titulo: correo.titulo, parrafos: correo.parrafos, boton: correo.boton, redirigible: true });
      if (id) await pool.query('SELECT fn_marcar_notificacion($1, true)', [id]);
      resultado.push({ rol, para, estado: 'enviado' });
    } catch (err) {
      if (id) await pool.query('SELECT fn_marcar_notificacion($1, false, $2)', [id, String(err.message).slice(0, 500)]).catch(() => {});
      resultado.push({ rol, para, estado: 'error', error: err.message });
    }
  }
  return resultado;
}

// Punto de entrada: notificar('pago_recibido', { suscripcion_id }, req). Nunca lanza error.
export async function notificar(evento, ids, req = null, extra = {}) {
  try {
    const u = base(req);
    if (ids.mantencion_id) {
      const d = await datosMantencion(ids.mantencion_id);
      if (!d) return [];
      const fechaEvento = evento === 'informe_listo' ? d.fecha_realizada : d.fecha_programada;
      return await despachar(evento, { ...d, ...extra }, { u, fechaEvento: fechaEvento ?? new Date().toISOString().slice(0, 10) });
    }
    if (ids.solicitud_id) {
      const { rows: [d] } = await pool.query(
        `SELECT s.id AS solicitud_id, s.tipo, s.descripcion, c.id AS cliente_id, c.nombre AS cliente, coalesce(i.nombre, i.codigo) AS instalacion
         FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id LEFT JOIN instalaciones i ON i.id = s.instalacion_id WHERE s.id = $1`, [ids.solicitud_id]);
      if (!d) return [];
      return await despachar(evento, d, { u, fechaEvento: new Date().toISOString().slice(0, 10) });
    }
    const d = await datosSuscripcion(ids.suscripcion_id);
    if (!d) return [];
    const fechaEvento = extra.fecha_evento ?? new Date().toISOString().slice(0, 10);
    return await despachar(evento, { ...d, ...extra }, { u, fechaEvento });
  } catch (err) {
    console.error(`No se pudo avisar ${evento}:`, err.message);
    return [];
  }
}

// ---------- Avisos del día (los llama el proceso diario) ----------
export async function avisosDelDia() {
  const hechos = [];
  const { rows: vencer } = await pool.query(
    `SELECT suscripcion_id, fecha_termino::text FROM v_suscripciones_estado v WHERE v.estado = 'vigente' AND v.fecha_termino = fn_hoy() + 15
       AND NOT EXISTS (SELECT 1 FROM suscripciones n WHERE n.suscripcion_anterior_id = v.suscripcion_id)`);
  for (const s of vencer) hechos.push(...await notificar('vencimiento_proximo', { suscripcion_id: s.suscripcion_id }, null, { fecha_evento: s.fecha_termino }));
  const { rows: vencidas } = await pool.query(
    `SELECT s.id, s.fecha_termino::text FROM suscripciones s WHERE s.estado = 'vencida' AND s.fecha_termino BETWEEN fn_hoy() - 3 AND fn_hoy()
       AND NOT EXISTS (SELECT 1 FROM suscripciones n WHERE n.instalacion_id = s.instalacion_id AND n.estado = 'vigente')`);
  for (const s of vencidas) hechos.push(...await notificar('suscripcion_vencida', { suscripcion_id: s.id }, null, { fecha_evento: s.fecha_termino }));
  const { rows: manana } = await pool.query("SELECT id FROM mantenciones WHERE estado = 'programada' AND fecha_programada = fn_hoy() + 1");
  for (const m of manana) hechos.push(...await notificar('mantencion_proxima', { mantencion_id: m.id }));
  return { avisos: hechos.length, detalle: hechos };
}

// ---------- Ejemplos para mostrar (Configuración → Correos) ----------
const EJEMPLO = {
  cliente: 'Camila Torres', cliente_id: 1, instalacion: 'Casa Calama', plan: 'Plan Básico', monto: 15000, dia_cobro: 9, suscripcion_id: 1,
  fecha_termino: '2027-11-09', pagado_hasta: '2026-12-08', incluidas: 2, limite: '2026-12-16', tarjeta: true,
  motivo: 'Falta de pago', cierre: '2026-12-09', tipo: 'preventiva', fecha_programada: '2027-02-09', hora_inicio: '10:00', mantencion_id: 1,
  tecnico: 'Carla Muñoz', direccion: 'Av. Granaderos 2150, Calama', telefono: '+56 9 7777 7777', fecha_realizada: '2027-02-09',
  solicitud_id: 1, descripcion: 'El inversor muestra una luz roja y no tenemos energía desde la mañana.',
};
export function ejemplos(req) {
  const u = base(req);
  const out = [];
  for (const [evento, p] of Object.entries(PLANTILLAS)) {
    for (const rol of ['cliente', 'admin', 'tecnico']) {
      if (!p[rol]) continue;
      const c = p[rol]({ ...EJEMPLO, tipo: evento === 'solicitud_nueva' ? 'emergencia' : EJEMPLO.tipo }, u);
      out.push({ evento, rol, para: ROLES[rol], cuando: p.cuando, asunto: c.asunto, correo: c,
        html: plantilla({ titulo: c.titulo, parrafos: c.parrafos, boton: c.boton }).replace('cid:syntia-logo', '/syntia-logo.png') });
    }
  }
  return out;
}
export async function enviarEjemplos(req, para, { evento, rol } = {}) {
  // Uno solo (el que se eligió) o todos
  const lista = ejemplos(req).filter((e) => (!evento || e.evento === evento) && (!rol || e.rol === rol));
  for (const e of lista) {
    await enviarCorreo({ para, asunto: `[Ejemplo · ${e.para}] ${e.asunto}`, titulo: e.correo.titulo, parrafos: e.correo.parrafos, boton: e.correo.boton });
  }
  return lista.length;
}
