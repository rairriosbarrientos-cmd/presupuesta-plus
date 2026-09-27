-- Solo para pruebas locales: imita lo mínimo de Supabase (roles, auth.users, auth.uid()).
-- NO correr en el proyecto real de Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase da permisos amplios por defecto; los imitamos para comprobar que la migración los quita.
alter default privileges in schema public grant all on tables to anon, authenticated;
