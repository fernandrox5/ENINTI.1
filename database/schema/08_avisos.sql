-- 08 · Avisos automáticos por correo: un correo por cada cosa que pasa, una sola vez.
-- Los arma y envía el backend (services/notificar.js); aquí solo se prepara el historial.

-- Tipos de aviso nuevos (los antiguos se mantienen: vencimiento_proximo, suscripcion_vencida, mantencion_proxima)
alter type public.tipo_evento add value if not exists 'suscripcion_contratada';
alter type public.tipo_evento add value if not exists 'pago_recibido';
alter type public.tipo_evento add value if not exists 'cobro_fallido';
alter type public.tipo_evento add value if not exists 'suscripcion_cerrada';
alter type public.tipo_evento add value if not exists 'mantencion_agendada';
alter type public.tipo_evento add value if not exists 'informe_listo';
alter type public.tipo_evento add value if not exists 'solicitud_nueva';

-- A quién va (cliente, admin o técnico) y el botón del correo
alter table public.notificaciones add column if not exists para text;
alter table public.notificaciones add column if not exists boton_texto text;
alter table public.notificaciones add column if not exists boton_url text;

-- El proceso diario de la base ya no genera avisos (antes avisaba 5 veces antes del vencimiento y
-- hablaba de deudas acumuladas). Sigue actualizando estados; los avisos del día los genera el backend.
create or replace function public.fn_generar_notificaciones()
returns integer language plpgsql security definer set search_path = public as $$
begin
  return 0;
end $$;

-- Los avisos antiguos que quedaron sin enviar no se mandan
update public.notificaciones set estado = 'descartada'
 where estado in ('pendiente', 'error');
