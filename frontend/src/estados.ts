// Etiquetas de estado comunes (suscripciones, pagos, solicitudes, mantenciones)
import type { Tono } from './componentes';

export function estadoSuscripcion(s: { estado: string; periodos_adeudados?: number; dias_restantes?: number | null; motivo_cierre?: string | null }): [Tono, string] {
  if (s.estado === 'vigente') {
    if ((s.periodos_adeudados ?? 0) > 0) return ['mala', 'Vigente · con deuda'];
    if (s.dias_restantes !== null && s.dias_restantes !== undefined && s.dias_restantes <= 30) return ['alerta', s.dias_restantes <= 0 ? 'Vigente · vence hoy' : 'Vigente · vence pronto'];
    return ['buena', 'Vigente'];
  }
  if (s.estado === 'vencida') return ['neutra', (s.periodos_adeudados ?? 0) > 0 ? 'Vencida · con deuda' : 'Vencida'];
  return ['neutra', s.motivo_cierre ? `Cerrada · ${s.motivo_cierre.toLowerCase()}` : 'Cerrada'];
}

export const ESTADO_PAGO: Record<string, [Tono, string]> = {
  pagado: ['buena', 'Pagado'], pendiente: ['alerta', 'Por validar'], rechazado: ['mala', 'Rechazado'], anulado: ['neutra', 'Anulado'],
};

export const ESTADO_SOLICITUD: Record<string, [Tono, string]> = {
  nueva: ['alerta', 'Nueva'], en_proceso: ['info', 'En proceso'], resuelta: ['buena', 'Resuelta'], cerrada: ['neutra', 'Cerrada'],
};
export const TIPO_SOLICITUD: Record<string, string> = { mantencion: 'Mantención', emergencia: 'Emergencia', consulta: 'Consulta' };
export const CANALES: Record<string, string> = { plataforma: 'Portal', whatsapp: 'WhatsApp', telefono: 'Teléfono', email: 'Correo', presencial: 'Presencial' };

export const ESTADO_MANTENCION: Record<string, [Tono, string]> = {
  programada: ['info', 'Programada'], realizada: ['buena', 'Realizada'], cancelada: ['neutra', 'Cancelada'],
};

// Situación de una instalación según su suscripción vigente
export function situacionInstalacion(i: { suscripcion_id?: number | null; dias_restantes?: number | null; periodos_adeudados?: number | null; pagos_por_validar?: number | null }): [Tono, string] {
  if (!i.suscripcion_id) return ['neutra', 'Sin suscripción'];
  const debe = i.periodos_adeudados ?? 0;
  if (debe > 0) return ['mala', `Debe ${debe} ${debe === 1 ? 'mes' : 'meses'}`];
  if ((i.pagos_por_validar ?? 0) > 0) return ['alerta', 'Pago en revisión'];
  if (i.dias_restantes !== null && i.dias_restantes !== undefined && i.dias_restantes <= 30) return ['alerta', i.dias_restantes <= 0 ? 'Vence hoy' : `Vence en ${i.dias_restantes} días`];
  return ['buena', 'Al día'];
}
