-- 09 · Las mantenciones las pide el cliente.
-- Antes, al contratar una suscripción se agendaban solas todas las preventivas del plan. Ahora el
-- cliente las pide desde su portal cuando las necesita, dentro de la vigencia de su suscripción y
-- hasta las que incluye su plan (mantenciones_por_anio). ENINTI agenda cada pedido en el calendario.
drop trigger if exists trg_suscripciones_programar_mantenciones on public.suscripciones;

-- Las preventivas futuras que se habían agendado solas (sin pedido, sin técnico y sin hora) se cancelan:
-- el cliente las pedirá cuando las necesite. No se borran.
update public.mantenciones
   set estado = 'cancelada', motivo_cancelacion = 'Ahora las mantenciones las pide el cliente desde su portal'
 where estado = 'programada' and tipo = 'preventiva' and solicitud_id is null and tecnico_id is null
   and hora_inicio is null and numero_en_plan is not null and fecha_programada > public.fn_hoy();
