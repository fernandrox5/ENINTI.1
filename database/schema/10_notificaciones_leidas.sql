-- 10 · Notificaciones leídas por cada usuario (la campana del administrador).
-- Antes se guardaba en el navegador: al cambiar de computador, de navegador o de ambiente volvían a
-- aparecer como nuevas. Ahora queda en la base: se marca una vez y queda leída en todas partes.
create table if not exists public.notificaciones_leidas (
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  clave      text not null,                 -- la notificación de la campana (ej.: sol-12, pag-30)
  leida_at   timestamptz not null default now(),
  primary key (perfil_id, clave)
);
-- Solo la usa el backend (service_role): sin políticas, nadie más la lee
alter table public.notificaciones_leidas enable row level security;
