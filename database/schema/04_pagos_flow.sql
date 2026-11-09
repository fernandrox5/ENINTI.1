-- =====================================================================
--  ENINTI · Plataforma de suscripciones de mantención solar
--  Script 04 — Pagos en línea con Flow (se ejecuta después del 03).
--  Solo agrega objetos: no modifica datos ni tablas existentes.
--
--    1. clientes.flow_customer_id: el cliente en Flow (uno por cliente)
--    2. tarjetas: tarjeta inscrita del cliente. Flow guarda la tarjeta;
--       aquí solo queda el tipo y los últimos 4 dígitos.
--    3. cobros: cada intento de cobro automático (tarjeta) o enlace de pago
--       (transferencia u otro medio de Flow). Al confirmarse, el cobro crea
--       los pagos de sus periodos.
--    4. Configuración de reintentos
-- =====================================================================

-- 1. Cliente en Flow
alter table public.clientes add column if not exists flow_customer_id text unique;

-- 2. Tarjetas inscritas
create table if not exists public.tarjetas (
  id              bigint generated always as identity primary key,
  cliente_id      bigint not null references public.clientes (id) on delete cascade,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'eliminada')),
  tipo            text,                 -- Visa, Mastercard, Redcompra...
  ultimos4        text check (ultimos4 ~ '^\d{4}$'),
  token_registro  text unique,          -- token de la inscripción en Flow
  inscrita_at     timestamptz,
  eliminada_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Una sola tarjeta activa por cliente
create unique index if not exists tarjetas_una_activa_uk on public.tarjetas (cliente_id) where estado = 'activa';
comment on table public.tarjetas is 'Tarjeta inscrita en Flow para el cobro automático. Syntia no guarda datos de la tarjeta.';

-- 3. Cobros (intentos de cobro y enlaces de pago)
create table if not exists public.cobros (
  id                 bigint generated always as identity primary key,
  suscripcion_id     bigint not null references public.suscripciones (id) on delete restrict,
  periodo            date not null check (periodo = date_trunc('month', periodo)::date),  -- primer periodo que cubre
  cantidad_periodos  smallint not null default 1 check (cantidad_periodos between 1 and 24),
  monto              integer not null check (monto > 0),
  canal              text not null check (canal in ('tarjeta', 'enlace')),
  origen             text not null default 'automatico' check (origen in ('automatico', 'cliente', 'admin')),
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'rechazado', 'anulado', 'expirado')),
  intento            smallint not null default 1,
  commerce_order     text not null unique,     -- orden de Syntia enviada a Flow
  flow_order         bigint,
  flow_token         text unique,
  url_pago           text,
  medio_flow         text,                     -- medio que informó Flow (Webpay, Servipag, Mach...)
  error              text,
  creado_por         uuid references public.perfiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists cobros_suscripcion_idx on public.cobros (suscripcion_id, periodo);
create index if not exists cobros_estado_idx on public.cobros (estado, created_at desc);
-- Un solo cobro pendiente por periodo
create unique index if not exists cobros_un_pendiente_uk on public.cobros (suscripcion_id, periodo) where estado = 'pendiente';

-- Pagos creados por un cobro de Flow
alter table public.pagos add column if not exists cobro_id bigint references public.cobros (id) on delete set null;

-- updated_at
drop trigger if exists trg_tarjetas_updated on public.tarjetas;
create trigger trg_tarjetas_updated before update on public.tarjetas for each row execute function public.fn_set_updated_at();
drop trigger if exists trg_cobros_updated on public.cobros;
create trigger trg_cobros_updated before update on public.cobros for each row execute function public.fn_set_updated_at();

-- Seguridad: el administrador ve todo; el cliente solo lo suyo
alter table public.tarjetas enable row level security;
alter table public.cobros   enable row level security;
drop policy if exists "admin_todo" on public.tarjetas;
create policy "admin_todo" on public.tarjetas for all to authenticated
  using ((select public.fn_es_admin())) with check ((select public.fn_es_admin()));
drop policy if exists "cliente_ver_tarjetas" on public.tarjetas;
create policy "cliente_ver_tarjetas" on public.tarjetas for select to authenticated
  using (cliente_id = (select public.fn_mi_cliente_id()));
drop policy if exists "admin_todo" on public.cobros;
create policy "admin_todo" on public.cobros for all to authenticated
  using ((select public.fn_es_admin())) with check ((select public.fn_es_admin()));
drop policy if exists "cliente_ver_cobros" on public.cobros;
create policy "cliente_ver_cobros" on public.cobros for select to authenticated
  using (suscripcion_id in (select s.id from public.suscripciones s where s.instalacion_id in (select public.fn_mis_instalaciones())));

-- 4. Reintentos del cobro automático
insert into public.configuracion (clave, valor, descripcion)
values ('reintentos_cobro', '3', 'Intentos de cobro automático con tarjeta por periodo (uno por día) antes de pasar a cobranza')
on conflict (clave) do nothing;

-- Fin del script 04
