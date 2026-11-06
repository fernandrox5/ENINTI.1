-- =====================================================================
--  ENINTI · Plataforma de suscripciones de mantención solar
--  Script 02 — Ajustes al esquema según la revisión (se ejecuta después
--  del script 01, sin modificarlo).
--
--    1. Encabezado: el sistema se llama ENINTI (ver comentario del esquema)
--    2. documentos.visible_cliente, filtrado en las políticas del cliente
--    3. pagos.motivo_rechazo y pagos.motivo_anulacion
--    4. 'deposito' en el enum medio_pago
--    5. v_suscripciones_estado: el periodo en curso no se adeuda hasta que
--       pasan los días de gracia (configuracion.dias_gracia_pago)
--    6. fn_renovar_suscripcion con p_motivo (renovación o cambio de plan)
--    7. fn_calificar_mantencion: se califica una sola vez
--    8. mantenciones: valor_servicio, hora_inicio, hora_fin, detalle_inversion
--    9. condiciones_servicio (versión, vigencia y PDF) enlazada desde suscripciones
--
--  Cómo ejecutarlo: Supabase → SQL Editor → pegar todo → Run
--  (o "npm run db:init --prefix backend", que ejecuta 00, 01, 02 y 03).
-- =====================================================================


-- =====================================================================
-- 1. NOMBRE DEL SISTEMA
-- =====================================================================
comment on schema public is 'ENINTI · Plataforma de suscripciones de mantención solar';


-- =====================================================================
-- 2. DOCUMENTOS VISIBLES PARA EL CLIENTE
--    Por defecto un documento es interno; el administrador decide cuáles
--    ve el cliente (planos, fotos e informes sí; notas internas no).
-- =====================================================================
alter table public.documentos
  add column visible_cliente boolean not null default false;

drop policy if exists "cliente_ver_documentos" on public.documentos;
create policy "cliente_ver_documentos" on public.documentos for select to authenticated
  using (visible_cliente and instalacion_id in (select public.fn_mis_instalaciones()));

-- El archivo en Storage solo se puede abrir si su documento es visible
drop policy if exists "eninti_cliente_ver_documentos" on storage.objects;
create policy "eninti_cliente_ver_documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = 'instalaciones'
         and (storage.foldername(name))[2] in (select x::text from public.fn_mis_instalaciones() x)
         and exists (select 1 from public.documentos d
                     where d.storage_path = objects.name and d.visible_cliente));


-- =====================================================================
-- 3. MOTIVOS DE RECHAZO Y ANULACIÓN DE PAGOS (nada se borra)
-- =====================================================================
alter table public.pagos
  add column motivo_rechazo   text,
  add column motivo_anulacion text,
  add constraint pagos_motivo_rechazo_ck   check (estado <> 'rechazado' or nullif(trim(motivo_rechazo), '') is not null),
  add constraint pagos_motivo_anulacion_ck check (estado <> 'anulado' or nullif(trim(motivo_anulacion), '') is not null);


-- =====================================================================
-- 4. MEDIO DE PAGO "DEPÓSITO"
--    (el valor nuevo no se puede usar en la misma transacción: los datos
--    que lo usan van en el script 03)
-- =====================================================================
alter type public.medio_pago add value if not exists 'deposito' after 'efectivo';


-- =====================================================================
-- 5. DEUDA CON DÍAS DE GRACIA
--    Igual que en el script 01, pero un periodo recién empezado solo pasa a
--    adeudado cuando han pasado los días de gracia desde su inicio
--    (corte_exigible = hoy - días de gracia). periodos_esperados no cambia.
-- =====================================================================
create or replace view public.v_suscripciones_estado with (security_invoker = true) as
select
  s.id                         as suscripcion_id,
  s.codigo,
  s.estado,
  s.fecha_inicio,
  s.fecha_termino,
  s.fecha_cierre,
  s.motivo_cierre,
  s.meses_gratis,
  s.monto_pactado,
  s.frecuencia_pago,
  s.suscripcion_anterior_id,
  t.id                         as tipo_suscripcion_id,
  t.codigo                     as tipo_codigo,
  t.nombre                     as tipo_nombre,
  i.id                         as instalacion_id,
  i.codigo                     as instalacion_codigo,
  i.nombre                     as instalacion_nombre,
  i.direccion,
  l.nombre                     as localidad,
  c.id                         as cliente_id,
  c.nombre                     as cliente_nombre,
  c.email                      as cliente_email,
  c.telefono                   as cliente_telefono,
  (s.fecha_termino - public.fn_hoy())                                   as dias_restantes,
  (s.estado = 'vigente' and public.fn_hoy() <= s.fecha_termino)         as vigente_hoy,
  coalesce(p.periodos_pagados, 0)                                       as periodos_pagados,
  coalesce(p.total_pagado, 0)                                           as total_pagado,
  p.ultimo_periodo_pagado,
  case when coalesce(p.periodos_pagados, 0) > 0 then
    (s.fecha_inicio + make_interval(months => s.meses_gratis
       + p.periodos_pagados::int * public.fn_meses_periodo(s.frecuencia_pago)) - interval '1 day')::date
  end                                                                    as pagado_hasta,
  coalesce(p.pagos_por_validar, 0)                                      as pagos_por_validar,
  e.periodos_esperados,
  greatest(0, e.periodos_exigibles - coalesce(p.periodos_pagados, 0))  as periodos_adeudados,
  greatest(0, e.periodos_exigibles - coalesce(p.periodos_pagados, 0)) * s.monto_pactado
                                                                         as monto_adeudado,
  (e.periodos_exigibles - coalesce(p.periodos_pagados, 0) <= 0)        as al_dia,
  m.ultima_mantencion,
  m.proxima_mantencion,
  coalesce(m.mantenciones_realizadas, 0)                                as mantenciones_realizadas
from public.suscripciones s
join public.tipos_suscripcion t on t.id = s.tipo_suscripcion_id
join public.instalaciones i     on i.id = s.instalacion_id
join public.clientes c          on c.id = i.cliente_id
left join public.localidades l  on l.id = i.localidad_id
left join lateral (
  select count(*) filter (where pg.estado = 'pagado')                    as periodos_pagados,
         sum(pg.monto) filter (where pg.estado = 'pagado')               as total_pagado,
         max(pg.periodo) filter (where pg.estado = 'pagado')             as ultimo_periodo_pagado,
         count(*) filter (where pg.estado = 'pendiente')                 as pagos_por_validar
  from public.pagos pg where pg.suscripcion_id = s.id
) p on true
left join lateral (
  select max(mt.fecha_realizada) filter (where mt.estado = 'realizada')  as ultima_mantencion,
         min(mt.fecha_programada) filter (where mt.estado = 'programada'
                                           and mt.fecha_programada >= public.fn_hoy()) as proxima_mantencion,
         count(*) filter (where mt.estado = 'realizada')                 as mantenciones_realizadas
  from public.mantenciones mt where mt.suscripcion_id = s.id
) m on true
cross join lateral (
  -- Los periodos se cuentan por mes de CONTRATO (no por mes calendario):
  -- un contrato del 06-11 tiene periodos que parten el 06 de cada mes.
  -- inicio_cobro = inicio + meses gratis; corte = hoy (o el día antes del término/cierre)
  select (s.fecha_inicio + make_interval(months => s.meses_gratis))::date            as inicio_cobro,
         least(public.fn_hoy(), coalesce(s.fecha_cierre, s.fecha_termino) - 1)        as corte,
         -- ajuste 5: un periodo se exige recién cuando pasaron los días de gracia
         least(public.fn_hoy() - coalesce(public.fn_config('dias_gracia_pago')::int, 5),
               coalesce(s.fecha_cierre, s.fecha_termino) - 1)                          as corte_exigible
) k
cross join lateral (
  select case when k.corte < k.inicio_cobro then 0
              else ((extract(year from age(k.corte, k.inicio_cobro)) * 12
                     + extract(month from age(k.corte, k.inicio_cobro)))::int
                    / public.fn_meses_periodo(s.frecuencia_pago)) + 1
         end as periodos_esperados,
         case when k.corte_exigible < k.inicio_cobro then 0
              else ((extract(year from age(k.corte_exigible, k.inicio_cobro)) * 12
                     + extract(month from age(k.corte_exigible, k.inicio_cobro)))::int
                    / public.fn_meses_periodo(s.frecuencia_pago)) + 1
         end as periodos_exigibles
) e;

update public.configuracion
   set descripcion = 'Días desde el inicio de cada periodo en que, si no se ha pagado, pasa a estar atrasado'
 where clave = 'dias_gracia_pago';


-- =====================================================================
-- 6. RENOVAR O CAMBIAR DE PLAN CON MOTIVO
--    Cierra la suscripción vigente con el motivo indicado y crea la nueva
--    encadenada. Sin motivo: "Renovación" si se mantiene el plan,
--    "Cambio de plan" si cambia.
-- =====================================================================
drop function if exists public.fn_renovar_suscripcion(bigint, smallint, date, smallint);

create or replace function public.fn_renovar_suscripcion(p_suscripcion_id bigint,
                                                         p_tipo_suscripcion_id smallint default null,
                                                         p_fecha_inicio date default null,
                                                         p_meses_gratis smallint default 0,
                                                         p_motivo text default null)
returns bigint language plpgsql as $$
declare
  v_ant   public.suscripciones;
  v_tipo  smallint;
  v_nueva bigint;
  v_ini   date := coalesce(p_fecha_inicio, public.fn_hoy());
begin
  select * into v_ant from public.suscripciones where id = p_suscripcion_id for update;
  if not found then
    raise exception 'La suscripción % no existe', p_suscripcion_id;
  end if;
  v_tipo := coalesce(p_tipo_suscripcion_id, v_ant.tipo_suscripcion_id);

  if v_ant.estado = 'vigente' then
    update public.suscripciones
       set estado = 'cerrada', fecha_cierre = v_ini,
           motivo_cierre = coalesce(nullif(trim(p_motivo), ''),
                                    case when v_tipo = v_ant.tipo_suscripcion_id
                                         then 'Renovación' else 'Cambio de plan' end)
     where id = v_ant.id;
  end if;

  insert into public.suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio,
                                    meses_gratis, suscripcion_anterior_id)
  values (v_ant.instalacion_id, v_tipo, v_ini, coalesce(p_meses_gratis, 0), v_ant.id)
  returning id into v_nueva;

  return v_nueva;
end $$;


-- =====================================================================
-- 7. CALIFICAR UNA MANTENCIÓN UNA SOLA VEZ
-- =====================================================================
create or replace function public.fn_calificar_mantencion(p_mantencion_id bigint, p_nota smallint,
                                                          p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_nota not between 1 and 5 then
    raise exception 'La calificación debe estar entre 1 y 5';
  end if;
  update public.mantenciones
     set calificacion_cliente = p_nota, comentario_cliente = p_comentario
   where id = p_mantencion_id
     and estado = 'realizada'
     and calificacion_cliente is null
     and instalacion_id in (select public.fn_mis_instalaciones());
  if not found then
    raise exception 'Mantención no encontrada, aún no realizada o ya calificada';
  end if;
end $$;


-- =====================================================================
-- 8. DATOS DEL SERVICIO EN LA MANTENCIÓN
-- =====================================================================
alter table public.mantenciones
  add column valor_servicio    integer check (valor_servicio >= 0),  -- valor cobrado por la visita (correctivas, emergencias)
  add column hora_inicio       time,
  add column hora_fin          time,
  add column detalle_inversion text,                                  -- qué inversión se recomienda (requiere_inversion)
  add constraint mantenciones_horas_ck check (hora_fin is null or hora_inicio is null or hora_fin > hora_inicio);


-- =====================================================================
-- 9. CONDICIONES DEL SERVICIO (versiones con su PDF)
--    La suscripción guarda qué versión aceptó el cliente (condiciones_id).
--    version_condiciones (script 01) se mantiene sincronizada por trigger.
-- =====================================================================
create table public.condiciones_servicio (
  id             smallint generated always as identity primary key,
  version        text not null unique,
  titulo         text not null default 'Condiciones del servicio de mantención ENINTI',
  vigente_desde  date not null default public.fn_hoy(),
  vigente_hasta  date,
  archivo_path   text,          -- PDF en el bucket público "condiciones": <version>.pdf
  created_at     timestamptz not null default now(),
  constraint condiciones_vigencia_ck check (vigente_hasta is null or vigente_hasta > vigente_desde)
);
-- Solo una versión abierta (sin fecha de término) a la vez
create unique index condiciones_una_abierta_uk on public.condiciones_servicio ((true)) where vigente_hasta is null;

alter table public.suscripciones
  add column condiciones_id smallint references public.condiciones_servicio (id);

create or replace function public.fn_suscripciones_condiciones()
returns trigger language plpgsql as $$
begin
  if new.condiciones_id is not null then
    select version into new.version_condiciones from public.condiciones_servicio where id = new.condiciones_id;
  elsif new.version_condiciones is not null then
    select id into new.condiciones_id from public.condiciones_servicio where version = new.version_condiciones;
  end if;
  if new.condiciones_id is not null and new.acepto_condiciones_at is null then
    new.acepto_condiciones_at := now();
  end if;
  return new;
end $$;
create trigger trg_suscripciones_condiciones
  before insert or update of condiciones_id, version_condiciones on public.suscripciones
  for each row execute function public.fn_suscripciones_condiciones();

alter table public.condiciones_servicio enable row level security;
create policy "admin_todo" on public.condiciones_servicio for all to authenticated
  using ((select public.fn_es_admin())) with check ((select public.fn_es_admin()));
-- Las condiciones son públicas: se muestran antes de registrarse
create policy "condiciones_ver" on public.condiciones_servicio for select to anon, authenticated using (true);

insert into public.condiciones_servicio (version, vigente_desde, archivo_path)
values ((select valor from public.configuracion where clave = 'version_condiciones'), '2026-11-01', 'v1.pdf');

-- Bucket público para los PDF de condiciones; solo el administrador los sube
insert into storage.buckets (id, name, public)
values ('condiciones', 'condiciones', true)
on conflict (id) do nothing;

drop policy if exists "eninti_admin_condiciones" on storage.objects;
create policy "eninti_admin_condiciones" on storage.objects for all to authenticated
  using (bucket_id = 'condiciones' and (select public.fn_es_admin()))
  with check (bucket_id = 'condiciones' and (select public.fn_es_admin()));

-- Fin del script 02
