-- =====================================================================
--  ENINTI · Plataforma de suscripciones de mantención solar
--  Script 01 — Esquema completo para Supabase (PostgreSQL 15+)
--
--  Modelo acordado en la consultoría:
--      Cliente → Instalación → Suscripción → { Pagos , Mantenciones }
--
--  Reglas clave:
--    1. La suscripción es de la INSTALACIÓN, no del cliente.
--    2. No existe "renovar": se CIERRA/VENCE una suscripción y se CREA
--       otra nueva (así queda el historial de recuperaciones).
--    3. Máximo 1 suscripción vigente por instalación.
--    4. Vigente mientras hoy <= fecha_termino.
--    5. La instalación NO nace con suscripción (son eventos distintos).
--
--  Cómo ejecutarlo: Supabase → SQL Editor → pegar todo → Run.
--  Pensado para un proyecto nuevo (ejecutar una sola vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (OPCIONAL) Reinicio completo. Descomentar SOLO si se quiere borrar
-- todo lo creado por este script y volver a ejecutarlo.
-- ---------------------------------------------------------------------
-- drop view if exists public.v_resumen_admin, public.v_equipos_fin_vida_util,
--   public.v_ranking_tecnicos, public.v_calendario_mantenciones, public.v_pagos_por_mes,
--   public.v_ingresos_por_cliente, public.v_historial_retencion,
--   public.v_instalaciones_sin_suscripcion, public.v_por_vencer, public.v_morosos,
--   public.v_suscripciones_estado cascade;
-- drop table if exists public.notificaciones, public.gestiones, public.documentos,
--   public.pagos, public.mantenciones, public.solicitudes, public.suscripciones,
--   public.tipos_suscripcion, public.equipos, public.instalaciones, public.tecnicos,
--   public.clientes, public.localidades, public.configuracion, public.perfiles cascade;
-- drop type if exists public.rol_usuario, public.frecuencia_pago, public.estado_suscripcion,
--   public.medio_pago, public.estado_pago, public.tipo_mantencion, public.estado_mantencion,
--   public.tipo_equipo, public.tipo_documento, public.tipo_solicitud, public.estado_solicitud,
--   public.prioridad, public.tipo_evento, public.estado_notificacion, public.tipo_gestion cascade;


-- =====================================================================
-- 0. EXTENSIONES
-- =====================================================================
-- pg_cron ejecuta el proceso diario (vencimientos + avisos).
-- En Supabase también se puede activar en Database → Extensions.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron no disponible: el proceso diario no se programará automáticamente.';
  end if;
end $$;


-- =====================================================================
-- 1. TIPOS ENUMERADOS
-- =====================================================================
create type public.rol_usuario         as enum ('admin', 'cliente', 'tecnico');
create type public.frecuencia_pago     as enum ('mensual', 'trimestral', 'semestral', 'anual');
create type public.estado_suscripcion  as enum ('vigente', 'vencida', 'cerrada');
create type public.medio_pago          as enum ('tarjeta', 'transferencia', 'efectivo', 'otro');
create type public.estado_pago         as enum ('pendiente', 'pagado', 'rechazado', 'anulado');
create type public.tipo_mantencion     as enum ('preventiva', 'correctiva', 'emergencia');
create type public.estado_mantencion   as enum ('programada', 'realizada', 'cancelada');
create type public.tipo_equipo         as enum ('panel', 'inversor', 'bateria', 'estructura', 'medidor', 'otro');
create type public.tipo_documento      as enum ('plano', 'foto', 'contrato', 'informe', 'otro');
create type public.tipo_solicitud      as enum ('mantencion', 'emergencia', 'consulta');
create type public.estado_solicitud    as enum ('nueva', 'en_proceso', 'resuelta', 'cerrada');
create type public.prioridad           as enum ('baja', 'media', 'alta', 'critica');
create type public.tipo_evento         as enum ('vencimiento_proximo', 'suscripcion_vencida', 'pago_atrasado', 'mantencion_proxima');
create type public.estado_notificacion as enum ('pendiente', 'enviada', 'error', 'descartada');
create type public.tipo_gestion        as enum ('llamada', 'whatsapp', 'email', 'visita', 'otro');


-- =====================================================================
-- 2. FUNCIONES BASE (no dependen de tablas)
-- =====================================================================

-- Fecha de hoy en hora de Chile (el servidor de Supabase está en UTC).
create or replace function public.fn_hoy()
returns date language sql stable as $$
  select (now() at time zone 'America/Santiago')::date
$$;

-- Meses que cubre un periodo de cobro según la frecuencia.
create or replace function public.fn_meses_periodo(f public.frecuencia_pago)
returns integer language sql immutable as $$
  select case f when 'mensual' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end
$$;

-- Mantiene updated_at al día.
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;


-- =====================================================================
-- 3. TABLAS
-- =====================================================================

-- 3.1 Perfiles: un registro por usuario de Supabase Auth (clase Usuario)
create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  rol         public.rol_usuario not null default 'cliente',
  nombre      text,
  email       text,
  telefono    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.perfiles is 'Usuarios de la plataforma (admin, cliente, técnico) enlazados a auth.users.';

-- 3.2 Localidades / poblados atendidos (permite agrupar clientes por poblado)
create table public.localidades (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  comuna  text not null,
  region  text not null default 'Antofagasta'
);

-- 3.3 Clientes (persona o empresa dueña de una o más plantas)
create table public.clientes (
  id            bigint generated always as identity primary key,
  perfil_id     uuid unique references public.perfiles (id) on delete set null,
  rut           text unique,
  nombre        text not null,
  es_empresa    boolean not null default false,
  email         text,
  telefono      text,
  direccion     text,
  localidad_id  smallint references public.localidades (id),
  origen        text,          -- cómo llegó: boca a boca, Instagram, referido...
  notas         text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index clientes_email_uk on public.clientes (lower(email)) where email is not null;
comment on table public.clientes is 'Ficha del cliente. Un cliente tiene 1..* instalaciones.';

-- 3.4 Técnicos / empresas subcontratistas (instalan y mantienen)
create table public.tecnicos (
  id                 bigint generated always as identity primary key,
  perfil_id          uuid unique references public.perfiles (id) on delete set null,
  nombre             text not null,
  empresa            text,
  rut                text,
  telefono           text,
  email              text,
  es_subcontratista  boolean not null default true,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3.5 Instalaciones (plantas fotovoltaicas) — ficha técnica
create table public.instalaciones (
  id                    bigint generated always as identity primary key,
  codigo                text not null unique,                 -- INS-0001 (se genera solo)
  cliente_id            bigint not null references public.clientes (id) on delete restrict,
  nombre                text,                                 -- "Casa Caspana", "Bodega"
  direccion             text not null,
  localidad_id          smallint references public.localidades (id),
  latitud               numeric(9,6),
  longitud              numeric(9,6),
  fecha_instalacion     date,
  potencia_kwp          numeric(8,2) check (potencia_kwp > 0),
  tipo_sistema          text check (tipo_sistema in ('on_grid', 'off_grid', 'hibrido')),
  instalada_por_eninti  boolean not null default true,        -- false = planta de terceros que mantenemos
  instalador_id         bigint references public.tecnicos (id) on delete set null,
  notas                 text,
  activa                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index instalaciones_cliente_idx on public.instalaciones (cliente_id);
comment on table public.instalaciones is 'Planta instalada. Tiene 0..* suscripciones en el tiempo (máx. 1 vigente).';

-- 3.6 Equipos de cada instalación (marca y modelo → oportunidades de venta)
create table public.equipos (
  id                    bigint generated always as identity primary key,
  instalacion_id        bigint not null references public.instalaciones (id) on delete cascade,
  tipo                  public.tipo_equipo not null,
  marca                 text,
  modelo                text,
  cantidad              integer not null default 1 check (cantidad > 0),
  potencia_unitaria_w   numeric(10,2),
  capacidad_kwh         numeric(10,2),                        -- baterías
  numero_serie          text,
  fecha_instalacion     date,
  garantia_hasta        date,
  vida_util_anios       smallint check (vida_util_anios > 0),
  activo                boolean not null default true,
  fecha_retiro          date,
  motivo_retiro         text,
  mantencion_retiro_id  bigint,                               -- FK se agrega más abajo
  reemplaza_a_id        bigint references public.equipos (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint equipos_retiro_ck check (activo or fecha_retiro is not null)
);
create index equipos_instalacion_idx on public.equipos (instalacion_id);

-- 3.7 Tipos de suscripción (planes). Hoy existe solo el Básico.
create table public.tipos_suscripcion (
  id                          smallint generated always as identity primary key,
  codigo                      text not null unique,
  nombre                      text not null,
  descripcion                 text,
  frecuencia_pago             public.frecuencia_pago not null default 'mensual',
  monto_clp                   integer not null check (monto_clp >= 0),     -- monto por periodo de cobro
  duracion_meses              smallint not null default 12 check (duracion_meses > 0),
  mantenciones_por_anio       smallint not null default 2 check (mantenciones_por_anio >= 0),
  incluye_reposicion_equipos  boolean not null default false,
  tiempo_respuesta_horas      smallint,                                    -- nivel de servicio (SLA)
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 3.8 Suscripciones (compromiso de pago de una instalación por un tiempo)
create table public.suscripciones (
  id                       bigint generated always as identity primary key,
  codigo                   text not null unique,                          -- SUS-2026-00001 (se genera solo)
  instalacion_id           bigint not null references public.instalaciones (id) on delete restrict,
  tipo_suscripcion_id      smallint not null references public.tipos_suscripcion (id),
  monto_pactado            integer not null check (monto_pactado >= 0),   -- se copia del plan al contratar
  frecuencia_pago          public.frecuencia_pago not null,               -- se copia del plan al contratar
  fecha_inicio             date not null default public.fn_hoy(),
  fecha_termino            date not null,                                 -- se calcula con la duración del plan
  meses_gratis             smallint not null default 0 check (meses_gratis >= 0),
  estado                   public.estado_suscripcion not null default 'vigente',
  fecha_cierre             date,
  motivo_cierre            text,
  suscripcion_anterior_id  bigint references public.suscripciones (id) on delete set null,
  acepto_condiciones_at    timestamptz,                                   -- aceptación digital de condiciones de servicio
  version_condiciones      text,
  creada_por               uuid references public.perfiles (id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint suscripciones_fechas_ck check (fecha_termino > fecha_inicio),
  constraint suscripciones_cierre_ck check ((estado = 'cerrada') = (fecha_cierre is not null))
);
-- Regla 3: máximo una suscripción vigente por instalación
create unique index suscripciones_una_vigente_uk on public.suscripciones (instalacion_id) where estado = 'vigente';
create index suscripciones_instalacion_idx on public.suscripciones (instalacion_id, fecha_inicio desc);
create index suscripciones_termino_idx on public.suscripciones (fecha_termino) where estado = 'vigente';
comment on table public.suscripciones is 'Cabecera de la suscripción. Renovar = crear una nueva (suscripcion_anterior_id guarda la cadena).';

-- 3.9 Pagos (eventos de pago que cuelgan de una suscripción)
create table public.pagos (
  id                  bigint generated always as identity primary key,
  suscripcion_id      bigint not null references public.suscripciones (id) on delete restrict,
  periodo             date not null,                 -- mes en que parte el periodo pagado (se guarda como día 1)
  monto               integer not null check (monto >= 0),
  fecha_pago          timestamptz,
  medio_pago          public.medio_pago not null,
  estado              public.estado_pago not null default 'pendiente',
  referencia_externa  text,                          -- id de la transacción en la pasarela
  comprobante_path    text,                          -- voucher subido al bucket "comprobantes"
  nro_boleta          text,
  boleta_emitida_at   timestamptz,
  observaciones       text,
  registrado_por      uuid references public.perfiles (id) on delete set null default auth.uid(),
  validado_por        uuid references public.perfiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pagos_periodo_ck check (periodo = date_trunc('month', periodo)::date),
  constraint pagos_fecha_ck check (estado <> 'pagado' or fecha_pago is not null)
);
-- Un periodo no se puede pagar dos veces
create unique index pagos_periodo_pagado_uk on public.pagos (suscripcion_id, periodo) where estado = 'pagado';
create index pagos_suscripcion_idx on public.pagos (suscripcion_id);
create index pagos_fecha_idx on public.pagos (fecha_pago);

-- 3.10 Solicitudes del cliente (pedir mantención / reportar emergencia)
create table public.solicitudes (
  id              bigint generated always as identity primary key,
  cliente_id      bigint not null references public.clientes (id) on delete cascade,
  instalacion_id  bigint references public.instalaciones (id) on delete set null,
  tipo            public.tipo_solicitud not null,
  prioridad       public.prioridad not null default 'media',
  descripcion     text not null,
  canal           text not null default 'plataforma'
                  check (canal in ('plataforma', 'whatsapp', 'telefono', 'email', 'presencial')),
  estado          public.estado_solicitud not null default 'nueva',
  respuesta       text,
  atendida_por    uuid references public.perfiles (id) on delete set null,
  atendida_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index solicitudes_estado_idx on public.solicitudes (estado, created_at desc);

-- 3.11 Mantenciones (eventos de mantención). Las preventivas cuelgan de la
--      suscripción; una correctiva a una planta sin suscripción se registra
--      con suscripcion_id = null (servicio cobrado aparte).
create table public.mantenciones (
  id                    bigint generated always as identity primary key,
  instalacion_id        bigint not null references public.instalaciones (id) on delete restrict,
  suscripcion_id        bigint references public.suscripciones (id) on delete set null,
  solicitud_id          bigint references public.solicitudes (id) on delete set null,
  numero_en_plan        smallint,                     -- 1 de 2, 2 de 2...
  tipo                  public.tipo_mantencion not null default 'preventiva',
  estado                public.estado_mantencion not null default 'programada',
  fecha_programada      date,
  fecha_realizada       date,
  tecnico_id            bigint references public.tecnicos (id) on delete set null,
  trabajo_realizado     text,                         -- limpieza, revisión inversor, medición paneles...
  hallazgos             text,
  recomendaciones       text,
  requiere_inversion    boolean not null default false, -- aviso preventivo al cliente
  costo_adicional       integer not null default 0 check (costo_adicional >= 0),
  calificacion_cliente  smallint check (calificacion_cliente between 1 and 5),
  comentario_cliente    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint mantenciones_realizada_ck check (estado <> 'realizada' or fecha_realizada is not null)
);
create index mantenciones_suscripcion_idx on public.mantenciones (suscripcion_id);
create index mantenciones_instalacion_idx on public.mantenciones (instalacion_id);
create index mantenciones_agenda_idx on public.mantenciones (fecha_programada) where estado = 'programada';
create index mantenciones_tecnico_idx on public.mantenciones (tecnico_id);

alter table public.equipos
  add constraint equipos_mantencion_retiro_fk
  foreign key (mantencion_retiro_id) references public.mantenciones (id) on delete set null;

-- 3.12 Documentos (planos, fotos, contratos) guardados en Supabase Storage
create table public.documentos (
  id              bigint generated always as identity primary key,
  instalacion_id  bigint not null references public.instalaciones (id) on delete cascade,
  mantencion_id   bigint references public.mantenciones (id) on delete set null,
  tipo            public.tipo_documento not null default 'otro',
  nombre          text not null,
  storage_path    text not null unique,   -- ruta en el bucket "documentos": instalaciones/<id>/archivo.pdf
  subido_por      uuid references public.perfiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

-- 3.13 Gestiones con el cliente (llamadas para retener / recuperar)
create table public.gestiones (
  id              bigint generated always as identity primary key,
  cliente_id      bigint not null references public.clientes (id) on delete cascade,
  suscripcion_id  bigint references public.suscripciones (id) on delete set null,
  tipo            public.tipo_gestion not null,
  motivo          text not null,      -- pago atrasado, suscripción vencida, oferta cambio de equipo...
  resultado       text,
  fecha           timestamptz not null default now(),
  realizada_por   uuid references public.perfiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

-- 3.14 Notificaciones (cola de correos que genera el proceso diario)
create table public.notificaciones (
  id                bigint generated always as identity primary key,
  tipo_evento       public.tipo_evento not null,
  suscripcion_id    bigint references public.suscripciones (id) on delete cascade,
  mantencion_id     bigint references public.mantenciones (id) on delete cascade,
  cliente_id        bigint references public.clientes (id) on delete cascade,
  fecha_evento      date not null,
  dias_restantes    integer,
  fecha_generacion  date not null default public.fn_hoy(),
  destinatario      text not null,
  asunto            text not null,
  mensaje           text not null,
  estado            public.estado_notificacion not null default 'pendiente',
  intentos          smallint not null default 0,
  enviada_at        timestamptz,
  ultimo_error      text,
  created_at        timestamptz not null default now()
);
-- Evita duplicar el mismo aviso el mismo día
create unique index notificaciones_dia_uk on public.notificaciones
  (tipo_evento, coalesce(suscripcion_id, 0), coalesce(mantencion_id, 0), destinatario, fecha_generacion);
create index notificaciones_pendientes_idx on public.notificaciones (created_at) where estado = 'pendiente';

-- 3.15 Configuración general
create table public.configuracion (
  clave        text primary key,
  valor        text not null,
  descripcion  text,
  updated_at   timestamptz not null default now()
);


-- =====================================================================
-- 4. FUNCIONES DE APOYO PARA SEGURIDAD (RLS)
-- =====================================================================
create or replace function public.fn_config(p_clave text)
returns text language sql stable security definer set search_path = public as $$
  select valor from public.configuracion where clave = p_clave
$$;

create or replace function public.fn_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles
                 where id = (select auth.uid()) and rol = 'admin' and activo)
$$;

create or replace function public.fn_mi_cliente_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.clientes where perfil_id = (select auth.uid())
$$;

create or replace function public.fn_mi_tecnico_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.tecnicos where perfil_id = (select auth.uid())
$$;

create or replace function public.fn_mis_instalaciones()
returns setof bigint language sql stable security definer set search_path = public as $$
  select i.id from public.instalaciones i
  join public.clientes c on c.id = i.cliente_id
  where c.perfil_id = (select auth.uid())
$$;

create or replace function public.fn_instalaciones_tecnico()
returns setof bigint language sql stable security definer set search_path = public as $$
  select distinct m.instalacion_id from public.mantenciones m
  join public.tecnicos t on t.id = m.tecnico_id
  where t.perfil_id = (select auth.uid())
$$;


-- =====================================================================
-- 5. TRIGGERS DE NEGOCIO
-- =====================================================================

-- 5.1 updated_at en todas las tablas que lo tienen
do $$
declare t text;
begin
  foreach t in array array['perfiles','clientes','tecnicos','instalaciones','equipos',
                           'tipos_suscripcion','suscripciones','pagos','solicitudes',
                           'mantenciones','configuracion']
  loop
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.fn_set_updated_at()', t);
  end loop;
end $$;

-- 5.2 Código automático de instalación: INS-0001
create or replace function public.fn_instalaciones_codigo()
returns trigger language plpgsql as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := 'INS-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;
create trigger trg_instalaciones_codigo before insert on public.instalaciones
  for each row execute function public.fn_instalaciones_codigo();

-- 5.3 Suscripción nueva: completa precio, frecuencia, fecha de término y código;
--     enlaza con la suscripción anterior de la misma instalación (historial).
create or replace function public.fn_suscripciones_antes_insertar()
returns trigger language plpgsql as $$
declare
  v_tipo   public.tipos_suscripcion;
  v_actual public.suscripciones;
begin
  select * into v_tipo from public.tipos_suscripcion where id = new.tipo_suscripcion_id;
  if not found then
    raise exception 'El tipo de suscripción % no existe', new.tipo_suscripcion_id;
  end if;

  new.fecha_inicio    := coalesce(new.fecha_inicio, public.fn_hoy());
  new.monto_pactado   := coalesce(new.monto_pactado, v_tipo.monto_clp);
  new.frecuencia_pago := coalesce(new.frecuencia_pago, v_tipo.frecuencia_pago);
  new.fecha_termino   := coalesce(new.fecha_termino,
                           (new.fecha_inicio + make_interval(months => v_tipo.duracion_meses))::date);
  new.codigo          := coalesce(nullif(new.codigo, ''),
                           'SUS-' || to_char(new.fecha_inicio, 'YYYY') || '-' || lpad(new.id::text, 5, '0'));

  -- Carga de suscripciones históricas: si ya terminó, entra como vencida
  if new.estado = 'vigente' and new.fecha_termino < public.fn_hoy() then
    new.estado := 'vencida';
  end if;

  -- Solo una vigente por instalación (mensaje claro antes del índice único)
  if new.estado = 'vigente' then
    select * into v_actual from public.suscripciones
    where instalacion_id = new.instalacion_id and estado = 'vigente';
    if found then
      raise exception 'La instalación ya tiene la suscripción vigente %. Ciérrela (fn_cerrar_suscripcion) o use fn_renovar_suscripcion.', v_actual.codigo;
    end if;
  end if;

  -- Encadenar con la última suscripción de la instalación
  if new.suscripcion_anterior_id is null then
    select id into new.suscripcion_anterior_id
    from public.suscripciones
    where instalacion_id = new.instalacion_id
    order by fecha_inicio desc, id desc
    limit 1;
  end if;

  return new;
end $$;
create trigger trg_suscripciones_antes_insertar before insert on public.suscripciones
  for each row execute function public.fn_suscripciones_antes_insertar();

-- 5.4 Al crear una suscripción vigente se agendan sus mantenciones preventivas.
--     Plan Básico (2 al año, 12 meses) → meses 3 y 9 del contrato.
create or replace function public.fn_suscripciones_programar_mantenciones()
returns trigger language plpgsql as $$
declare
  v_por_anio  integer;
  v_duracion  integer;
  v_total     integer;
  v_cada      integer;
  v_fecha     date;
  i           integer;
begin
  if new.estado <> 'vigente' then
    return new;
  end if;

  select mantenciones_por_anio, duracion_meses into v_por_anio, v_duracion
  from public.tipos_suscripcion where id = new.tipo_suscripcion_id;

  if coalesce(v_por_anio, 0) = 0 then
    return new;
  end if;

  v_cada  := greatest(1, 12 / v_por_anio);
  v_total := ceil(v_por_anio * v_duracion / 12.0);

  for i in 1..v_total loop
    v_fecha := (new.fecha_inicio + make_interval(months => i * v_cada - v_cada / 2))::date;
    exit when v_fecha > new.fecha_termino;
    insert into public.mantenciones (instalacion_id, suscripcion_id, numero_en_plan, tipo, estado, fecha_programada)
    values (new.instalacion_id, new.id, i, 'preventiva', 'programada', v_fecha);
  end loop;

  return new;
end $$;
create trigger trg_suscripciones_programar_mantenciones after insert on public.suscripciones
  for each row execute function public.fn_suscripciones_programar_mantenciones();

-- 5.5 Al cerrar una suscripción se cancelan sus mantenciones futuras
create or replace function public.fn_suscripciones_al_cerrar()
returns trigger language plpgsql as $$
begin
  if new.estado = 'cerrada' and old.estado <> 'cerrada' then
    update public.mantenciones
       set estado = 'cancelada'
     where suscripcion_id = new.id
       and estado = 'programada'
       and fecha_programada > new.fecha_cierre;
  end if;
  return new;
end $$;
create trigger trg_suscripciones_al_cerrar after update of estado on public.suscripciones
  for each row execute function public.fn_suscripciones_al_cerrar();

-- 5.6 Pagos: normaliza periodo, completa monto y fecha
create or replace function public.fn_pagos_antes_guardar()
returns trigger language plpgsql as $$
begin
  new.periodo := date_trunc('month', new.periodo)::date;
  if new.monto is null then
    select monto_pactado into new.monto from public.suscripciones where id = new.suscripcion_id;
  end if;
  if new.estado = 'pagado' and new.fecha_pago is null then
    new.fecha_pago := now();
  end if;
  return new;
end $$;
create trigger trg_pagos_antes_guardar before insert or update on public.pagos
  for each row execute function public.fn_pagos_antes_guardar();

-- 5.7 Mantenciones: instalación coherente con la suscripción y fecha de realización
create or replace function public.fn_mantenciones_antes_guardar()
returns trigger language plpgsql as $$
declare v_inst bigint;
begin
  if new.suscripcion_id is not null then
    select instalacion_id into v_inst from public.suscripciones where id = new.suscripcion_id;
    if new.instalacion_id is null then
      new.instalacion_id := v_inst;
    elsif new.instalacion_id <> v_inst then
      raise exception 'La mantención no corresponde a la instalación de la suscripción';
    end if;
  end if;
  if new.estado = 'realizada' and new.fecha_realizada is null then
    new.fecha_realizada := public.fn_hoy();
  end if;
  return new;
end $$;
create trigger trg_mantenciones_antes_guardar before insert or update on public.mantenciones
  for each row execute function public.fn_mantenciones_antes_guardar();

-- 5.8 Solicitudes: el cliente se completa solo y la instalación debe ser suya
create or replace function public.fn_solicitudes_antes_insertar()
returns trigger language plpgsql as $$
begin
  new.cliente_id := coalesce(new.cliente_id, public.fn_mi_cliente_id());
  if new.instalacion_id is not null and not exists (
       select 1 from public.instalaciones where id = new.instalacion_id and cliente_id = new.cliente_id) then
    raise exception 'La instalación no pertenece al cliente';
  end if;
  return new;
end $$;
create trigger trg_solicitudes_antes_insertar before insert on public.solicitudes
  for each row execute function public.fn_solicitudes_antes_insertar();

-- 5.9 Perfiles: solo un admin puede cambiar rol o activo
create or replace function public.fn_perfiles_proteger()
returns trigger language plpgsql as $$
begin
  if (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
     and auth.uid() is not null and not public.fn_es_admin() then
    raise exception 'Solo un administrador puede cambiar el rol o el estado de un usuario';
  end if;
  return new;
end $$;
create trigger trg_perfiles_proteger before update on public.perfiles
  for each row execute function public.fn_perfiles_proteger();

-- 5.10 Registro de usuarios: crea el perfil y, cuando el correo está
--      confirmado, lo vincula con su ficha de cliente o técnico (por email).
create or replace function public.fn_auth_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario := 'cliente';
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.tecnicos where lower(email) = lower(new.email)) then
      v_rol := 'tecnico';
    end if;
    insert into public.perfiles (id, rol, nombre, email, telefono)
    values (new.id, v_rol,
            coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name',
                     split_part(new.email, '@', 1)),
            new.email,
            new.raw_user_meta_data ->> 'telefono')
    on conflict (id) do nothing;
  end if;

  if new.email_confirmed_at is not null then
    update public.clientes set perfil_id = new.id
     where perfil_id is null and lower(email) = lower(new.email);
    update public.tecnicos set perfil_id = new.id
     where perfil_id is null and lower(email) = lower(new.email);
  end if;
  return new;
end $$;

drop trigger if exists trg_auth_usuario_creado on auth.users;
create trigger trg_auth_usuario_creado after insert on auth.users
  for each row execute function public.fn_auth_usuario();

drop trigger if exists trg_auth_usuario_confirmado on auth.users;
create trigger trg_auth_usuario_confirmado after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.fn_auth_usuario();


-- =====================================================================
-- 6. VISTAS (reportes y pantallas). security_invoker = respetan RLS:
--    el admin ve todo y el cliente solo lo suyo.
-- =====================================================================

-- 6.1 Estado completo de cada suscripción: vigencia, días restantes,
--     meses pagados, deuda, última y próxima mantención.
--     → Pantalla principal del cliente y tabla del administrador.
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
  greatest(0, e.periodos_esperados - coalesce(p.periodos_pagados, 0))   as periodos_adeudados,
  greatest(0, e.periodos_esperados - coalesce(p.periodos_pagados, 0)) * s.monto_pactado
                                                                         as monto_adeudado,
  (e.periodos_esperados - coalesce(p.periodos_pagados, 0) <= 0)         as al_dia,
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
         least(public.fn_hoy(), coalesce(s.fecha_cierre, s.fecha_termino) - 1)        as corte
) k
cross join lateral (
  select case when k.corte < k.inicio_cobro then 0
              else ((extract(year from age(k.corte, k.inicio_cobro)) * 12
                     + extract(month from age(k.corte, k.inicio_cobro)))::int
                    / public.fn_meses_periodo(s.frecuencia_pago)) + 1
         end as periodos_esperados
) e;

-- 6.2 Morosos: quién no ha pagado ("el botoncito rojo")
create or replace view public.v_morosos with (security_invoker = true) as
select * from public.v_suscripciones_estado
where estado in ('vigente', 'vencida') and periodos_adeudados > 0
order by periodos_adeudados desc, monto_adeudado desc;

-- 6.3 Suscripciones por vencer en los próximos 30 días
create or replace view public.v_por_vencer with (security_invoker = true) as
select * from public.v_suscripciones_estado
where estado = 'vigente' and dias_restantes between 0 and 30
order by dias_restantes;

-- 6.4 Instalaciones sin suscripción vigente → clientes a recuperar
create or replace view public.v_instalaciones_sin_suscripcion with (security_invoker = true) as
select
  i.id               as instalacion_id,
  i.codigo           as instalacion_codigo,
  i.nombre           as instalacion_nombre,
  i.direccion,
  l.nombre           as localidad,
  i.fecha_instalacion,
  c.id               as cliente_id,
  c.nombre           as cliente_nombre,
  c.telefono         as cliente_telefono,
  c.email            as cliente_email,
  h.cantidad_suscripciones,
  h.ultima_fecha_fin,
  h.ultimo_motivo_cierre,
  case when h.cantidad_suscripciones = 0 then 'nunca suscrita' else 'suscripción terminada' end as situacion,
  (public.fn_hoy() - h.ultima_fecha_fin)                         as dias_sin_cobertura,
  (select max(g.fecha) from public.gestiones g where g.cliente_id = c.id) as ultima_gestion
from public.instalaciones i
join public.clientes c         on c.id = i.cliente_id
left join public.localidades l on l.id = i.localidad_id
cross join lateral (
  select count(*)                                                    as cantidad_suscripciones,
         max(coalesce(s.fecha_cierre, s.fecha_termino))              as ultima_fecha_fin,
         (array_agg(s.motivo_cierre order by s.fecha_inicio desc))[1] as ultimo_motivo_cierre
  from public.suscripciones s where s.instalacion_id = i.id
) h
where i.activa
  and not exists (select 1 from public.suscripciones s
                  where s.instalacion_id = i.id and s.estado = 'vigente');

-- 6.5 Historial de retención por instalación (cuántas veces se recuperó)
create or replace view public.v_historial_retencion with (security_invoker = true) as
select
  i.id                                    as instalacion_id,
  i.codigo                                as instalacion_codigo,
  c.id                                    as cliente_id,
  c.nombre                                as cliente_nombre,
  count(s.id)                             as total_suscripciones,
  count(s.id) filter (where a.id is not null
                        and s.fecha_inicio > coalesce(a.fecha_cierre, a.fecha_termino)) as recuperaciones,
  count(s.id) filter (where a.id is not null
                        and s.fecha_inicio <= coalesce(a.fecha_cierre, a.fecha_termino)) as renovaciones_sin_corte,
  min(s.fecha_inicio)                     as suscrito_desde,
  bool_or(s.estado = 'vigente')           as tiene_vigente,
  coalesce((select sum(p.monto) from public.pagos p
            join public.suscripciones s2 on s2.id = p.suscripcion_id
            where s2.instalacion_id = i.id and p.estado = 'pagado'), 0) as total_pagado
from public.instalaciones i
join public.clientes c            on c.id = i.cliente_id
left join public.suscripciones s  on s.instalacion_id = i.id
left join public.suscripciones a  on a.id = s.suscripcion_anterior_id
group by i.id, i.codigo, c.id, c.nombre;

-- 6.6 Ingresos por cliente (ordenado de mayor a menor)
create or replace view public.v_ingresos_por_cliente with (security_invoker = true) as
select
  c.id                                                         as cliente_id,
  c.nombre                                                     as cliente_nombre,
  l.nombre                                                     as localidad,
  count(distinct i.id)                                         as instalaciones,
  count(distinct s.id)                                         as suscripciones_historicas,
  count(distinct s.id) filter (where s.estado = 'vigente')     as suscripciones_vigentes,
  coalesce(sum(p.monto) filter (where p.estado = 'pagado'), 0) as total_pagado,
  max(p.fecha_pago) filter (where p.estado = 'pagado')         as ultimo_pago
from public.clientes c
left join public.localidades l   on l.id = c.localidad_id
left join public.instalaciones i on i.cliente_id = c.id
left join public.suscripciones s on s.instalacion_id = i.id
left join public.pagos p         on p.suscripcion_id = s.id
group by c.id, c.nombre, l.nombre
order by total_pagado desc;

-- 6.7 Pagos por mes (listado para emitir boletas)
create or replace view public.v_pagos_por_mes with (security_invoker = true) as
select
  date_trunc('month', p.fecha_pago at time zone 'America/Santiago')::date as mes,
  p.id                 as pago_id,
  p.fecha_pago,
  p.periodo,
  p.monto,
  p.medio_pago,
  p.nro_boleta,
  (p.boleta_emitida_at is not null) as boleta_emitida,
  s.codigo             as suscripcion_codigo,
  i.codigo             as instalacion_codigo,
  c.nombre             as cliente_nombre,
  c.rut                as cliente_rut,
  c.email              as cliente_email
from public.pagos p
join public.suscripciones s on s.id = p.suscripcion_id
join public.instalaciones i on i.id = s.instalacion_id
join public.clientes c      on c.id = i.cliente_id
where p.estado = 'pagado';

-- 6.8 Calendario de mantenciones programadas
create or replace view public.v_calendario_mantenciones with (security_invoker = true) as
select
  m.id                 as mantencion_id,
  m.fecha_programada,
  m.tipo,
  m.numero_en_plan,
  m.estado,
  i.codigo             as instalacion_codigo,
  i.nombre             as instalacion_nombre,
  i.direccion,
  l.nombre             as localidad,
  c.nombre             as cliente_nombre,
  c.telefono           as cliente_telefono,
  t.nombre             as tecnico_nombre,
  t.empresa            as tecnico_empresa,
  s.codigo             as suscripcion_codigo
from public.mantenciones m
join public.instalaciones i      on i.id = m.instalacion_id
join public.clientes c           on c.id = i.cliente_id
left join public.localidades l   on l.id = i.localidad_id
left join public.tecnicos t      on t.id = m.tecnico_id
left join public.suscripciones s on s.id = m.suscripcion_id
where m.estado = 'programada'
order by m.fecha_programada;

-- 6.9 Ranking de técnicos (calificación y trabajos)
create or replace view public.v_ranking_tecnicos with (security_invoker = true) as
select
  t.id                                                              as tecnico_id,
  t.nombre,
  t.empresa,
  count(m.id) filter (where m.estado = 'realizada')                 as mantenciones_realizadas,
  count(m.id) filter (where m.estado = 'realizada' and m.tipo <> 'preventiva') as correctivas_y_emergencias,
  round(avg(m.calificacion_cliente), 2)                             as calificacion_promedio,
  count(m.calificacion_cliente)                                     as cantidad_calificaciones,
  (select count(*) from public.instalaciones i where i.instalador_id = t.id) as instalaciones_hechas
from public.tecnicos t
left join public.mantenciones m on m.tecnico_id = t.id
group by t.id, t.nombre, t.empresa
order by calificacion_promedio desc nulls last, mantenciones_realizadas desc;

-- 6.10 Equipos cerca del fin de su vida útil (próximos 12 meses) → venta
create or replace view public.v_equipos_fin_vida_util with (security_invoker = true) as
select
  e.id                 as equipo_id,
  e.tipo, e.marca, e.modelo, e.cantidad,
  e.fecha_instalacion,
  e.vida_util_anios,
  (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date as fin_vida_util,
  i.codigo             as instalacion_codigo,
  c.nombre             as cliente_nombre,
  c.telefono           as cliente_telefono
from public.equipos e
join public.instalaciones i on i.id = e.instalacion_id
join public.clientes c      on c.id = i.cliente_id
where e.activo
  and e.fecha_instalacion is not null and e.vida_util_anios is not null
  and (e.fecha_instalacion + make_interval(years => e.vida_util_anios))::date
        <= public.fn_hoy() + 365
order by fin_vida_util;

-- 6.11 Resumen para el panel del administrador (una fila con los KPIs)
create or replace view public.v_resumen_admin with (security_invoker = true) as
select
  (select count(*) from public.clientes where activo)                                   as clientes_activos,
  (select count(*) from public.instalaciones where activa)                              as instalaciones,
  (select count(*) from public.suscripciones where estado = 'vigente')                  as suscripciones_vigentes,
  (select count(*) from public.v_morosos)                                               as suscripciones_morosas,
  (select coalesce(sum(monto_adeudado), 0) from public.v_morosos)                       as monto_adeudado_total,
  (select count(*) from public.v_por_vencer)                                            as por_vencer_30_dias,
  (select count(*) from public.v_instalaciones_sin_suscripcion)                         as instalaciones_sin_suscripcion,
  (select coalesce(sum(monto), 0) from public.pagos
    where estado = 'pagado'
      and date_trunc('month', fecha_pago at time zone 'America/Santiago')
          = date_trunc('month', public.fn_hoy()::timestamp))                            as ingresos_mes_actual,
  (select coalesce(sum(monto_pactado), 0) from public.suscripciones
    where estado = 'vigente' and frecuencia_pago = 'mensual')                           as ingreso_mensual_recurrente,
  (select count(*) from public.solicitudes where estado = 'nueva')                      as solicitudes_nuevas,
  (select count(*) from public.pagos where estado = 'pendiente')                        as pagos_por_validar,
  (select count(*) from public.mantenciones
    where estado = 'programada' and fecha_programada between public.fn_hoy() and public.fn_hoy() + 7)
                                                                                         as mantenciones_esta_semana;


-- =====================================================================
-- 7. FUNCIONES DE NEGOCIO (se llaman desde el backend o el SQL editor)
-- =====================================================================

-- 7.1 Cerrar una suscripción (ej.: cambio de equipo, cliente se va)
create or replace function public.fn_cerrar_suscripcion(p_suscripcion_id bigint, p_motivo text,
                                                        p_fecha date default null)
returns void language plpgsql as $$
begin
  update public.suscripciones
     set estado = 'cerrada',
         fecha_cierre = coalesce(p_fecha, public.fn_hoy()),
         motivo_cierre = p_motivo
   where id = p_suscripcion_id and estado <> 'cerrada';
  if not found then
    raise exception 'La suscripción % no existe o ya está cerrada', p_suscripcion_id;
  end if;
end $$;

-- 7.2 "Renovar" = crear una suscripción NUEVA para la misma instalación.
--     Si la anterior sigue vigente, se cierra primero.
create or replace function public.fn_renovar_suscripcion(p_suscripcion_id bigint,
                                                         p_tipo_suscripcion_id smallint default null,
                                                         p_fecha_inicio date default null,
                                                         p_meses_gratis smallint default 0)
returns bigint language plpgsql as $$
declare
  v_ant   public.suscripciones;
  v_nueva bigint;
  v_ini   date := coalesce(p_fecha_inicio, public.fn_hoy());
begin
  select * into v_ant from public.suscripciones where id = p_suscripcion_id for update;
  if not found then
    raise exception 'La suscripción % no existe', p_suscripcion_id;
  end if;

  if v_ant.estado = 'vigente' then
    update public.suscripciones
       set estado = 'cerrada', fecha_cierre = v_ini,
           motivo_cierre = 'Reemplazada por una nueva suscripción'
     where id = v_ant.id;
  end if;

  insert into public.suscripciones (instalacion_id, tipo_suscripcion_id, fecha_inicio,
                                    meses_gratis, suscripcion_anterior_id)
  values (v_ant.instalacion_id, coalesce(p_tipo_suscripcion_id, v_ant.tipo_suscripcion_id),
          v_ini, p_meses_gratis, v_ant.id)
  returning id into v_nueva;

  return v_nueva;
end $$;

-- 7.3 El cliente califica una mantención realizada (1 a 5 estrellas)
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
     and instalacion_id in (select public.fn_mis_instalaciones());
  if not found then
    raise exception 'Mantención no encontrada o no se puede calificar';
  end if;
end $$;

-- 7.4 Pasa a "vencida" toda suscripción vigente cuya fecha de término ya pasó
create or replace function public.fn_actualizar_estados()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.suscripciones
     set estado = 'vencida'
   where estado = 'vigente' and fecha_termino < public.fn_hoy();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 7.5 Genera la cola de avisos del día (correo al admin y al cliente):
--     · "faltan N días" para suscripciones por vencer (días en configuracion)
--     · suscripción recién vencida sin renovar
--     · pago atrasado (después de los días de gracia, 1 aviso al mes)
--     · mantención programada próxima (admin, cliente y técnico)
create or replace function public.fn_generar_notificaciones()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoy        date    := public.fn_hoy();
  v_admin      text    := nullif(trim(public.fn_config('email_admin')), '');
  v_dias       int[]   := coalesce(string_to_array(replace(public.fn_config('dias_aviso_vencimiento'), ' ', ''), ',')::int[],
                                   array[7, 3, 2, 1, 0]);
  v_dias_mant  integer := coalesce(public.fn_config('dias_aviso_mantencion')::int, 7);
  v_gracia     integer := coalesce(public.fn_config('dias_gracia_pago')::int, 5);
  v_total      integer := 0;
  v_n          integer;
begin
  -- 1) Suscripciones por vencer
  insert into public.notificaciones (tipo_evento, suscripcion_id, cliente_id, fecha_evento,
                                     dias_restantes, destinatario, asunto, mensaje)
  select 'vencimiento_proximo', v.suscripcion_id, v.cliente_id, v.fecha_termino, v.dias_restantes,
         d.email,
         case when d.para = 'admin'
              then format('[Eninti] %s vence %s — %s', v.codigo,
                          case when v.dias_restantes = 0 then 'HOY' else format('en %s día(s)', v.dias_restantes) end,
                          v.cliente_nombre)
              else format('Su suscripción de mantención vence %s',
                          case when v.dias_restantes = 0 then 'hoy' else format('en %s día(s)', v.dias_restantes) end)
         end,
         case when d.para = 'admin'
              then format('La suscripción %s (instalación %s, cliente %s, fono %s) vence el %s. Quedan %s día(s). Contactar al cliente para renovarla.',
                          v.codigo, v.instalacion_codigo, v.cliente_nombre, coalesce(v.cliente_telefono, 's/i'),
                          to_char(v.fecha_termino, 'DD-MM-YYYY'), v.dias_restantes)
              else format('Hola %s: la suscripción de mantención de su planta %s vence el %s (quedan %s día(s)). Contáctenos para mantener su sistema protegido.',
                          v.cliente_nombre, coalesce(v.instalacion_nombre, v.instalacion_codigo),
                          to_char(v.fecha_termino, 'DD-MM-YYYY'), v.dias_restantes)
         end
  from public.v_suscripciones_estado v
  cross join lateral (values ('admin', v_admin), ('cliente', v.cliente_email)) as d (para, email)
  where v.estado = 'vigente'
    and v.dias_restantes = any (v_dias)
    and d.email is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  -- 2) Suscripciones vencidas en la última semana y no renovadas (solo admin)
  if v_admin is not null then
    insert into public.notificaciones (tipo_evento, suscripcion_id, cliente_id, fecha_evento,
                                       dias_restantes, destinatario, asunto, mensaje)
    select 'suscripcion_vencida', v.suscripcion_id, v.cliente_id, v.fecha_termino, v.dias_restantes,
           v_admin,
           format('[Eninti] %s VENCIÓ sin renovar — %s', v.codigo, v.cliente_nombre),
           format('La suscripción %s (instalación %s, cliente %s, fono %s) venció el %s y no tiene una nueva suscripción. Cliente en riesgo de perderse.',
                  v.codigo, v.instalacion_codigo, v.cliente_nombre, coalesce(v.cliente_telefono, 's/i'),
                  to_char(v.fecha_termino, 'DD-MM-YYYY'))
    from public.v_suscripciones_estado v
    where v.estado = 'vencida'
      and v.fecha_termino >= v_hoy - 7
      and not exists (select 1 from public.suscripciones s2
                      where s2.instalacion_id = v.instalacion_id and s2.estado = 'vigente')
      and not exists (select 1 from public.notificaciones n
                      where n.suscripcion_id = v.suscripcion_id and n.tipo_evento = 'suscripcion_vencida')
    on conflict do nothing;
    get diagnostics v_n = row_count;  v_total := v_total + v_n;
  end if;

  -- 3) Pagos atrasados (un aviso por suscripción al mes)
  if extract(day from v_hoy) > v_gracia then
    insert into public.notificaciones (tipo_evento, suscripcion_id, cliente_id, fecha_evento,
                                       dias_restantes, destinatario, asunto, mensaje)
    select 'pago_atrasado', v.suscripcion_id, v.cliente_id, v_hoy, null, d.email,
           case when d.para = 'admin'
                then format('[Eninti] Pago atrasado %s — %s (%s periodo(s))', v.codigo, v.cliente_nombre, v.periodos_adeudados)
                else 'Tiene pagos pendientes en su suscripción de mantención' end,
           case when d.para = 'admin'
                then format('El cliente %s (fono %s) adeuda %s periodo(s) de la suscripción %s: $%s. Último periodo pagado: %s.',
                            v.cliente_nombre, coalesce(v.cliente_telefono, 's/i'), v.periodos_adeudados, v.codigo,
                            to_char(v.monto_adeudado, 'FM999G999G999'),
                            coalesce(to_char(v.ultimo_periodo_pagado, 'MM-YYYY'), 'ninguno'))
                else format('Hola %s: registramos %s periodo(s) pendiente(s) de pago ($%s) en la suscripción de su planta %s. Si ya pagó, puede subir su comprobante en la plataforma.',
                            v.cliente_nombre, v.periodos_adeudados, to_char(v.monto_adeudado, 'FM999G999G999'),
                            coalesce(v.instalacion_nombre, v.instalacion_codigo)) end
    from public.v_suscripciones_estado v
    cross join lateral (values ('admin', v_admin), ('cliente', v.cliente_email)) as d (para, email)
    where v.estado = 'vigente'
      and v.periodos_adeudados > 0
      and d.email is not null
      and not exists (select 1 from public.notificaciones n
                      where n.suscripcion_id = v.suscripcion_id and n.tipo_evento = 'pago_atrasado'
                        and n.destinatario = d.email
                        and date_trunc('month', n.fecha_generacion) = date_trunc('month', v_hoy))
    on conflict do nothing;
    get diagnostics v_n = row_count;  v_total := v_total + v_n;
  end if;

  -- 4) Mantenciones próximas
  insert into public.notificaciones (tipo_evento, mantencion_id, suscripcion_id, cliente_id, fecha_evento,
                                     dias_restantes, destinatario, asunto, mensaje)
  select 'mantencion_proxima', m.id, m.suscripcion_id, c.id, m.fecha_programada,
         m.fecha_programada - v_hoy, d.email,
         format('Mantención programada para el %s', to_char(m.fecha_programada, 'DD-MM-YYYY')),
         format('Mantención %s de la planta %s (%s, %s). Cliente: %s, fono %s. Técnico: %s.',
                m.tipo, coalesce(i.nombre, i.codigo), i.direccion, coalesce(l.nombre, ''),
                c.nombre, coalesce(c.telefono, 's/i'), coalesce(t.nombre, 'por asignar'))
  from public.mantenciones m
  join public.instalaciones i    on i.id = m.instalacion_id
  join public.clientes c         on c.id = i.cliente_id
  left join public.localidades l on l.id = i.localidad_id
  left join public.tecnicos t    on t.id = m.tecnico_id
  cross join lateral (values (v_admin), (c.email), (t.email)) as d (email)
  where m.estado = 'programada'
    and m.fecha_programada - v_hoy = v_dias_mant
    and d.email is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  return v_total;
end $$;

-- 7.6 Proceso diario completo (lo ejecuta pg_cron)
create or replace function public.fn_proceso_diario()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_vencidas integer; v_avisos integer;
begin
  v_vencidas := public.fn_actualizar_estados();
  v_avisos   := public.fn_generar_notificaciones();
  return jsonb_build_object('fecha', public.fn_hoy(), 'suscripciones_vencidas', v_vencidas,
                            'notificaciones_generadas', v_avisos);
end $$;

-- 7.7 El que envía los correos (backend Node / Edge Function) marca el resultado
create or replace function public.fn_marcar_notificacion(p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notificaciones
     set estado       = case when p_ok then 'enviada'::public.estado_notificacion else 'error'::public.estado_notificacion end,
         enviada_at   = case when p_ok then now() else enviada_at end,
         intentos     = intentos + 1,
         ultimo_error = case when p_ok then null else p_error end
   where id = p_id;
end $$;

-- Las funciones del proceso solo las ejecutan el backend (service_role) y pg_cron
revoke execute on function public.fn_actualizar_estados()                     from public, anon, authenticated;
revoke execute on function public.fn_generar_notificaciones()                 from public, anon, authenticated;
revoke execute on function public.fn_proceso_diario()                         from public, anon, authenticated;
revoke execute on function public.fn_marcar_notificacion(bigint, boolean, text) from public, anon, authenticated;
grant  execute on function public.fn_actualizar_estados()                     to service_role;
grant  execute on function public.fn_generar_notificaciones()                 to service_role;
grant  execute on function public.fn_proceso_diario()                         to service_role;
grant  execute on function public.fn_marcar_notificacion(bigint, boolean, text) to service_role;


-- =====================================================================
-- 8. SEGURIDAD POR FILAS (RLS)
--    admin   → todo
--    cliente → solo sus instalaciones, suscripciones, pagos y mantenciones;
--              puede crear solicitudes y subir pagos "pendientes" (comprobante)
--    tecnico → mantenciones asignadas y las instalaciones de esas mantenciones
-- =====================================================================
alter table public.perfiles           enable row level security;
alter table public.localidades        enable row level security;
alter table public.clientes           enable row level security;
alter table public.tecnicos           enable row level security;
alter table public.instalaciones      enable row level security;
alter table public.equipos            enable row level security;
alter table public.tipos_suscripcion  enable row level security;
alter table public.suscripciones      enable row level security;
alter table public.pagos              enable row level security;
alter table public.solicitudes        enable row level security;
alter table public.mantenciones       enable row level security;
alter table public.documentos         enable row level security;
alter table public.gestiones          enable row level security;
alter table public.notificaciones     enable row level security;
alter table public.configuracion      enable row level security;

-- Admin: acceso total a todas las tablas
do $$
declare t text;
begin
  foreach t in array array['perfiles','localidades','clientes','tecnicos','instalaciones','equipos',
                           'tipos_suscripcion','suscripciones','pagos','solicitudes','mantenciones',
                           'documentos','gestiones','notificaciones','configuracion']
  loop
    execute format('create policy "admin_todo" on public.%I for all to authenticated
                    using ((select public.fn_es_admin())) with check ((select public.fn_es_admin()))', t);
  end loop;
end $$;

-- Perfiles: cada usuario ve y edita su propio perfil (rol/activo protegidos por trigger)
create policy "perfil_propio_ver"    on public.perfiles for select to authenticated using (id = (select auth.uid()));
create policy "perfil_propio_editar" on public.perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Catálogos públicos (la web/catálogo puede mostrarlos sin iniciar sesión)
create policy "localidades_ver" on public.localidades for select to anon, authenticated using (true);
create policy "planes_activos_ver" on public.tipos_suscripcion for select to anon, authenticated using (activo);

-- Cliente
create policy "cliente_ver_su_ficha" on public.clientes for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy "cliente_ver_instalaciones" on public.instalaciones for select to authenticated
  using (id in (select public.fn_mis_instalaciones()));
create policy "cliente_ver_equipos" on public.equipos for select to authenticated
  using (instalacion_id in (select public.fn_mis_instalaciones()));
create policy "cliente_ver_documentos" on public.documentos for select to authenticated
  using (instalacion_id in (select public.fn_mis_instalaciones()));
create policy "cliente_ver_suscripciones" on public.suscripciones for select to authenticated
  using (instalacion_id in (select public.fn_mis_instalaciones()));
create policy "cliente_ver_pagos" on public.pagos for select to authenticated
  using (suscripcion_id in (select id from public.suscripciones
                            where instalacion_id in (select public.fn_mis_instalaciones())));
create policy "cliente_informar_pago" on public.pagos for insert to authenticated
  with check (estado = 'pendiente'
              and suscripcion_id in (select id from public.suscripciones
                                     where instalacion_id in (select public.fn_mis_instalaciones())));
create policy "cliente_ver_mantenciones" on public.mantenciones for select to authenticated
  using (instalacion_id in (select public.fn_mis_instalaciones()));
create policy "cliente_ver_solicitudes" on public.solicitudes for select to authenticated
  using (cliente_id = (select public.fn_mi_cliente_id()));
create policy "cliente_crear_solicitud" on public.solicitudes for insert to authenticated
  with check (cliente_id = (select public.fn_mi_cliente_id()) and estado = 'nueva');
create policy "cliente_ver_tecnico_asignado" on public.tecnicos for select to authenticated
  using (id in (select tecnico_id from public.mantenciones
                where instalacion_id in (select public.fn_mis_instalaciones())));

-- Técnico (panel de técnico, fase 2)
create policy "tecnico_ver_su_ficha" on public.tecnicos for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy "tecnico_ver_mantenciones" on public.mantenciones for select to authenticated
  using (tecnico_id = (select public.fn_mi_tecnico_id()));
create policy "tecnico_actualizar_mantenciones" on public.mantenciones for update to authenticated
  using (tecnico_id = (select public.fn_mi_tecnico_id()))
  with check (tecnico_id = (select public.fn_mi_tecnico_id()));
create policy "tecnico_ver_instalaciones" on public.instalaciones for select to authenticated
  using (id in (select public.fn_instalaciones_tecnico()));
create policy "tecnico_ver_equipos" on public.equipos for select to authenticated
  using (instalacion_id in (select public.fn_instalaciones_tecnico()));
create policy "tecnico_subir_documentos" on public.documentos for insert to authenticated
  with check (instalacion_id in (select public.fn_instalaciones_tecnico()));
create policy "tecnico_ver_documentos" on public.documentos for select to authenticated
  using (instalacion_id in (select public.fn_instalaciones_tecnico()));


-- =====================================================================
-- 9. STORAGE (archivos)
--    documentos   → instalaciones/<instalacion_id>/<archivo>   (planos, fotos, informes)
--    comprobantes → <cliente_id>/<archivo>                    (vouchers de pago)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false), ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

create policy "eninti_admin_archivos" on storage.objects for all to authenticated
  using (bucket_id in ('documentos', 'comprobantes') and (select public.fn_es_admin()))
  with check (bucket_id in ('documentos', 'comprobantes') and (select public.fn_es_admin()));

create policy "eninti_cliente_ver_documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = 'instalaciones'
         and (storage.foldername(name))[2] in (select x::text from public.fn_mis_instalaciones() x));

create policy "eninti_tecnico_documentos" on storage.objects for all to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = 'instalaciones'
         and (storage.foldername(name))[2] in (select x::text from public.fn_instalaciones_tecnico() x))
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = 'instalaciones'
              and (storage.foldername(name))[2] in (select x::text from public.fn_instalaciones_tecnico() x));

create policy "eninti_cliente_comprobantes" on storage.objects for all to authenticated
  using (bucket_id = 'comprobantes'
         and (storage.foldername(name))[1] = (select public.fn_mi_cliente_id())::text)
  with check (bucket_id = 'comprobantes'
              and (storage.foldername(name))[1] = (select public.fn_mi_cliente_id())::text);


-- =====================================================================
-- 10. DATOS BASE
-- =====================================================================
insert into public.localidades (nombre, comuna) values
  ('Calama',      'Calama'),
  ('Chiu Chiu',   'Calama'),
  ('Lasana',      'Calama'),
  ('Caspana',     'Calama'),
  ('Toconce',     'Calama'),
  ('Tocopilla',   'Tocopilla'),
  ('María Elena', 'María Elena');

-- Plan vigente acordado con el cliente + dos propuestas (inactivas, por validar)
insert into public.tipos_suscripcion
  (codigo, nombre, descripcion, frecuencia_pago, monto_clp, duracion_meses, mantenciones_por_anio,
   incluye_reposicion_equipos, tiempo_respuesta_horas, activo)
values
  ('BASICA', 'Plan Básico',
   'Pago mensual de $15.000. Incluye 2 mantenciones preventivas al año (limpieza de paneles, revisión de inversor, cableado y mediciones).',
   'mensual', 15000, 12, 2, false, null, true),
  ('BASICA_ANUAL', 'Plan Básico Anual (propuesta)',
   'PROPUESTA por validar con el cliente: mismo servicio que el Básico, pagado de una vez al año con descuento.',
   'anual', 162000, 12, 2, false, null, false),
  ('PREMIUM', 'Plan Premium (propuesta)',
   'PROPUESTA por validar: 4 mantenciones al año, atención de emergencia en 24 h y equipo de reemplazo mientras se repara.',
   'mensual', 45000, 12, 4, true, 24, false);

insert into public.configuracion (clave, valor, descripcion) values
  ('email_admin',            'CAMBIAR@correo.cl',  'Correo que recibe los avisos del sistema'),
  ('dias_aviso_vencimiento', '30,15,7,3,2,1,0',    'Días antes del término en que se avisa (separados por coma)'),
  ('dias_aviso_mantencion',  '7',                  'Días antes de una mantención en que se avisa'),
  ('dias_gracia_pago',       '5',                  'Día del mes desde el cual un periodo impago se considera atrasado'),
  ('version_condiciones',    'v1',                 'Versión vigente de las condiciones de servicio');


-- =====================================================================
-- 11. PROCESO DIARIO AUTOMÁTICO (pg_cron)
--     11:00 UTC = 08:00 en Chile (horario de verano, UTC-3)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eninti_proceso_diario';
    perform cron.schedule('eninti_proceso_diario', '0 11 * * *', 'select public.fn_proceso_diario();');
  end if;
end $$;

-- Fin del script 01
