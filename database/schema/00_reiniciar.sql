-- =====================================================================
--  ENINTI · Script 00 — Borra todo lo que crean los scripts 01 y 02 para
--  volver a ejecutarlos (solo desarrollo: se pierden los datos).
--  Es el bloque "Reinicio completo" del script 01, más lo del script 02,
--  las políticas de Storage y la tarea de pg_cron.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eninti_proceso_diario';
  end if;
end $$;

drop policy if exists "eninti_admin_archivos"         on storage.objects;
drop policy if exists "eninti_cliente_ver_documentos" on storage.objects;
drop policy if exists "eninti_tecnico_documentos"     on storage.objects;
drop policy if exists "eninti_cliente_comprobantes"   on storage.objects;
drop policy if exists "eninti_admin_condiciones"      on storage.objects;

drop trigger if exists trg_auth_usuario_creado     on auth.users;
drop trigger if exists trg_auth_usuario_confirmado on auth.users;

drop view if exists public.v_resumen_admin, public.v_equipos_fin_vida_util,
  public.v_ranking_tecnicos, public.v_calendario_mantenciones, public.v_pagos_por_mes,
  public.v_ingresos_por_cliente, public.v_historial_retencion,
  public.v_instalaciones_sin_suscripcion, public.v_por_vencer, public.v_morosos,
  public.v_suscripciones_estado cascade;
drop table if exists public.cobros, public.tarjetas, public.condiciones_servicio, public.notificaciones, public.gestiones, public.documentos,
  public.pagos, public.mantenciones, public.solicitudes, public.suscripciones,
  public.tipos_suscripcion, public.equipos, public.instalaciones, public.tecnicos,
  public.clientes, public.localidades, public.configuracion, public.perfiles cascade;
drop type if exists public.rol_usuario, public.frecuencia_pago, public.estado_suscripcion,
  public.medio_pago, public.estado_pago, public.tipo_mantencion, public.estado_mantencion,
  public.tipo_equipo, public.tipo_documento, public.tipo_solicitud, public.estado_solicitud,
  public.prioridad, public.tipo_evento, public.estado_notificacion, public.tipo_gestion cascade;
