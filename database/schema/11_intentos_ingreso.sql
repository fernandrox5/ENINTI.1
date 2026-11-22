-- 11 · Intentos de inicio de sesión (OWASP A07 y A09)
-- Cada intento queda registrado con correo, IP, resultado y fecha. Con 5 intentos fallidos seguidos
-- en 15 minutos, ese correo queda bloqueado 15 minutos. Solo lo usa el backend (sin acceso desde el navegador).
create table if not exists public.intentos_ingreso (
  id      bigint generated always as identity primary key,
  correo  text not null,
  ip      text,
  exito   boolean not null,
  creado  timestamptz not null default now()
);
create index if not exists intentos_ingreso_correo_idx on public.intentos_ingreso (correo, creado desc);
alter table public.intentos_ingreso enable row level security;
