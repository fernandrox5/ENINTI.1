// Consultas SQL de control (Estándar de Pruebas ENINTI, sección 5, Regla 3).
// Definen cada indicador de forma independiente del código del sistema: si la pantalla
// muestra otra cosa, el que está mal es el sistema.
// El "mes en curso" se corta a medianoche en hora de Chile, según la fecha del sistema (fn_hoy).

const INICIO_MES = "(date_trunc('month', fn_hoy())::timestamp AT TIME ZONE 'America/Santiago')";
const FIN_MES = "((date_trunc('month', fn_hoy()) + interval '1 month')::timestamp AT TIME ZONE 'America/Santiago')";

export const CONTROL = {
  // Suscripciones activas: solo las vigentes
  activas: "SELECT count(*)::int AS v FROM suscripciones WHERE estado = 'vigente'",
  // Ingreso mensual: lo pactado de las vigentes, llevado a monto mensual
  ingreso_mensual: "SELECT coalesce(sum(monto_pactado / fn_meses_periodo(frecuencia_pago)), 0)::int AS v FROM suscripciones WHERE estado = 'vigente'",
  // Cobrado este mes: pagos pagados con fecha de pago dentro del mes en curso (hora de Chile)
  cobrado_mes: `SELECT coalesce(sum(monto), 0)::int AS v FROM pagos WHERE estado = 'pagado' AND fecha_pago >= ${INICIO_MES} AND fecha_pago < ${FIN_MES}`,
  // Pagado en el mes (Reportes): pagos pagados cuyo periodo (mes que cubren) es el mes en curso
  pagado_mes_reportes: "SELECT coalesce(sum(monto), 0)::int AS v FROM pagos WHERE estado = 'pagado' AND periodo = date_trunc('month', fn_hoy())::date",
  // Instalaciones activas sin suscripción vigente
  sin_suscripcion: `SELECT count(*)::int AS v FROM instalaciones i WHERE i.activa
                    AND NOT EXISTS (SELECT 1 FROM suscripciones s WHERE s.instalacion_id = i.id AND s.estado = 'vigente')`,
  // Comprobantes por validar
  por_validar: "SELECT count(*)::int AS v FROM pagos WHERE estado = 'pendiente'",
  // Vigentes con el mes en curso sin pagar, separadas por si siguen dentro del plazo (configuracion.dias_plazo_pago)
  pendientes_en_plazo: `SELECT count(*)::int AS v FROM v_suscripciones_estado v WHERE v.estado = 'vigente' AND v.periodos_adeudados > 0
                        AND fn_hoy() - (v.fecha_inicio + make_interval(months => (v.periodos_pagados)::int))::date < (SELECT valor::int FROM configuracion WHERE clave = 'dias_plazo_pago')`,
  pendientes_por_cerrar: `SELECT count(*)::int AS v FROM v_suscripciones_estado v WHERE v.estado = 'vigente' AND v.periodos_adeudados > 0
                          AND fn_hoy() - (v.fecha_inicio + make_interval(months => (v.periodos_pagados)::int))::date >= (SELECT valor::int FROM configuracion WHERE clave = 'dias_plazo_pago')`,
};

export const control = async (db, nombre) => (await db.query(CONTROL[nombre])).rows[0].v;
