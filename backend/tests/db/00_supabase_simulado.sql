-- Base de pruebas (PGlite, en memoria): reemplazo mínimo de lo que en producción entrega Supabase.
-- Solo existe mientras corren las pruebas. Nunca se ejecuta contra la base real.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

-- Supabase Auth: usuarios y el usuario de la sesión (auth.uid)
create schema if not exists auth;
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  email_confirmed_at  timestamptz,
  invited_at          timestamptz,
  last_sign_in_at     timestamptz,
  raw_user_meta_data  jsonb not null default '{}',
  created_at          timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase Storage: solo las tablas que nombran las políticas y los scripts
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text,
  owner uuid, metadata jsonb, created_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;
