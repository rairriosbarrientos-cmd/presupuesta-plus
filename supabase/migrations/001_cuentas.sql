-- Presupuesta+: cuentas por empresa, aprobación de miembros y licencias.
-- Tablas propias con prefijo pres_ en el mismo proyecto de Supabase; no toca las tablas de otras apps.
-- Comparte con la plataforma: public.plataforma_admins, public.es_admin_plataforma() y public._nuevo_codigo().
-- Toda escritura pasa por funciones que validan rol y licencia; las tablas solo se leen directamente.
-- Se puede correr más de una vez sin romper nada.

-- Piezas compartidas de la plataforma (dueños y generador de códigos). Solo se crean si faltan,
-- para no tocar las que ya existen en el proyecto.
create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;
revoke all on public.plataforma_admins from anon, authenticated;
do $do$ begin
  if to_regprocedure('public.es_admin_plataforma()') is null then
    execute $f$create function public.es_admin_plataforma() returns boolean language sql stable security definer set search_path = public as $b$
      select exists (select 1 from public.plataforma_admins where user_id = auth.uid()) $b$$f$;
    revoke execute on function public.es_admin_plataforma() from public, anon;
    grant execute on function public.es_admin_plataforma() to authenticated;
  end if;
  if to_regprocedure('public._nuevo_codigo()') is null then
    execute $f$create function public._nuevo_codigo() returns text language plpgsql volatile set search_path = public as $b$
      declare alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; codigo text := '';
      begin for i in 1..8 loop codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1); end loop; return codigo; end $b$$f$;
    revoke execute on function public._nuevo_codigo() from public, anon, authenticated;
  end if;
end $do$;

create table if not exists public.pres_empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  codigo_invitacion text not null unique,
  creada_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'suspendida')),
  vence date,
  max_usuarios integer check (max_usuarios is null or max_usuarios > 0),
  plan text,
  notas text
);

create table if not exists public.pres_miembros (
  empresa_id uuid not null references public.pres_empresas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'pendiente' check (rol in ('admin', 'editor', 'lector', 'pendiente')),
  email text,
  created_at timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index if not exists pres_miembros_user_idx on public.pres_miembros (user_id);

create table if not exists public.pres_registros (
  empresa_id uuid not null references public.pres_empresas (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null,
  version integer not null default 1,
  eliminado boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (empresa_id, id)
);
create index if not exists pres_registros_empresa_updated_idx on public.pres_registros (empresa_id, updated_at);

alter table public.pres_empresas enable row level security;
alter table public.pres_miembros enable row level security;
alter table public.pres_registros enable row level security;

create or replace function public.pres_mi_rol(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select rol from public.pres_miembros where empresa_id = p_empresa and user_id = auth.uid()
$$;

--   pendiente → recién creada, sin acceso hasta que el dueño la active.
--   activa    → uso normal (si tiene vencimiento y ya pasó, cuenta como "vencida": solo lectura).
--   suspendida → sin acceso.
create or replace function public.pres_licencia(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.estado = 'suspendida' then 'suspendida'
    when e.estado = 'pendiente' then 'pendiente'
    when e.vence is not null and e.vence < current_date then 'vencida'
    else 'activa' end
  from public.pres_empresas e where e.id = p_empresa
$$;

create or replace function public.pres_es_activo(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pres_mi_rol(p_empresa) in ('admin', 'editor', 'lector'), false)
     and coalesce(public.pres_licencia(p_empresa) in ('activa', 'vencida'), false)
$$;

create or replace function public.pres_puede_escribir(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pres_mi_rol(p_empresa) in ('admin', 'editor'), false)
     and coalesce(public.pres_licencia(p_empresa) = 'activa', false)
$$;

drop policy if exists pres_empresas_select on public.pres_empresas;
create policy pres_empresas_select on public.pres_empresas for select to authenticated
  using (public.pres_es_activo(id));

drop policy if exists pres_miembros_select on public.pres_miembros;
create policy pres_miembros_select on public.pres_miembros for select to authenticated
  using (user_id = auth.uid() or public.pres_es_activo(empresa_id));

drop policy if exists pres_registros_select on public.pres_registros;
create policy pres_registros_select on public.pres_registros for select to authenticated
  using (public.pres_es_activo(empresa_id));

revoke all on public.pres_empresas, public.pres_miembros, public.pres_registros from anon, authenticated;
grant select on public.pres_empresas, public.pres_miembros, public.pres_registros to authenticated;

create or replace function public.pres_crear_empresa(p_nombre text)
returns public.pres_empresas language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nueva public.pres_empresas;
begin
  if uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  loop
    begin
      insert into public.pres_empresas (nombre, codigo_invitacion, creada_por)
      values (btrim(p_nombre), public._nuevo_codigo(), uid)
      returning * into nueva;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into public.pres_miembros (empresa_id, user_id, rol, email)
  values (nueva.id, uid, 'admin', (select email from auth.users where id = uid));
  return nueva;
end $$;

-- Entrar con código solo pide acceso: queda pendiente hasta que un administrador lo acepta.
create or replace function public.pres_unirse_empresa(p_codigo text)
returns public.pres_empresas language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e public.pres_empresas;
begin
  if uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  select * into e from public.pres_empresas where codigo_invitacion = upper(btrim(p_codigo));
  if not found then raise exception 'codigo_invalido' using errcode = 'P0002'; end if;
  insert into public.pres_miembros (empresa_id, user_id, rol, email)
  values (e.id, uid, 'pendiente', (select email from auth.users where id = uid))
  on conflict (empresa_id, user_id) do nothing;
  return e;
end $$;

create or replace function public.pres_regenerar_codigo(p_empresa uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  codigo text;
begin
  if public.pres_mi_rol(p_empresa) is distinct from 'admin' then raise exception 'sin_permiso' using errcode = '42501'; end if;
  loop
    begin
      codigo := public._nuevo_codigo();
      update public.pres_empresas set codigo_invitacion = codigo where id = p_empresa;
      return codigo;
    exception when unique_violation then
    end;
  end loop;
end $$;

create or replace function public.pres_cambiar_rol(p_empresa uuid, p_user uuid, p_rol text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rol_actual text;
  limite integer;
begin
  if public.pres_mi_rol(p_empresa) is distinct from 'admin' then raise exception 'sin_permiso' using errcode = '42501'; end if;
  if public.pres_licencia(p_empresa) is distinct from 'activa' then raise exception 'licencia_inactiva' using errcode = '42501'; end if;
  if p_rol not in ('admin', 'editor', 'lector') then raise exception 'rol_invalido' using errcode = '22023'; end if;
  perform 1 from public.pres_miembros where empresa_id = p_empresa for update;
  select rol into rol_actual from public.pres_miembros where empresa_id = p_empresa and user_id = p_user;
  if rol_actual = 'pendiente' then
    select max_usuarios into limite from public.pres_empresas where id = p_empresa;
    if limite is not null and (select count(*) from public.pres_miembros where empresa_id = p_empresa and rol <> 'pendiente') >= limite then
      raise exception 'limite_usuarios' using errcode = '23514';
    end if;
  end if;
  if p_rol <> 'admin' and rol_actual = 'admin'
     and (select count(*) from public.pres_miembros where empresa_id = p_empresa and rol = 'admin') = 1 then
    raise exception 'ultimo_admin' using errcode = '23514';
  end if;
  update public.pres_miembros set rol = p_rol where empresa_id = p_empresa and user_id = p_user;
end $$;

create or replace function public.pres_quitar_miembro(p_empresa uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from p_user and public.pres_mi_rol(p_empresa) is distinct from 'admin' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform 1 from public.pres_miembros where empresa_id = p_empresa for update;
  if (select rol from public.pres_miembros where empresa_id = p_empresa and user_id = p_user) = 'admin'
     and (select count(*) from public.pres_miembros where empresa_id = p_empresa and rol = 'admin') = 1 then
    raise exception 'ultimo_admin' using errcode = '23514';
  end if;
  delete from public.pres_miembros where empresa_id = p_empresa and user_id = p_user;
end $$;

-- Guarda un registro solo si nadie lo cambió desde la versión que tenía el celular;
-- si alguien más lo cambió, regresa la versión del servidor para que el celular fusione.
create or replace function public.pres_guardar_registro(
  p_empresa uuid, p_id text, p_data jsonb, p_version_base integer, p_eliminado boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actual public.pres_registros;
begin
  if not public.pres_puede_escribir(p_empresa) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  insert into public.pres_registros (empresa_id, id, data, version, eliminado, updated_by)
  values (p_empresa, p_id, p_data, 1, coalesce(p_eliminado, false), auth.uid())
  on conflict (empresa_id, id) do nothing
  returning * into actual;
  if found then
    return jsonb_build_object('ok', true, 'version', actual.version);
  end if;

  select * into actual from public.pres_registros where empresa_id = p_empresa and id = p_id for update;
  if actual.version <> coalesce(p_version_base, 0) then
    return jsonb_build_object('ok', false, 'conflicto', true, 'version', actual.version,
                              'data', actual.data, 'eliminado', actual.eliminado);
  end if;

  update public.pres_registros
     set data = p_data, version = actual.version + 1, eliminado = coalesce(p_eliminado, false),
         updated_at = now(), updated_by = auth.uid()
   where empresa_id = p_empresa and id = p_id;
  return jsonb_build_object('ok', true, 'version', actual.version + 1);
end $$;

drop function if exists public.pres_mis_empresas();
create function public.pres_mis_empresas()
returns table (id uuid, nombre text, rol text, codigo text, licencia text, vence date, max_usuarios integer)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, m.rol,
         case when m.rol <> 'pendiente' and public.pres_licencia(e.id) in ('activa', 'vencida') then e.codigo_invitacion end,
         public.pres_licencia(e.id), e.vence, e.max_usuarios
  from public.pres_miembros m join public.pres_empresas e on e.id = m.empresa_id
  where m.user_id = auth.uid()
  order by m.created_at
$$;

-- ---------- Panel del dueño ----------

drop function if exists public.pres_plataforma_empresas();
create function public.pres_plataforma_empresas()
returns table (id uuid, nombre text, estado text, licencia text, vence date, max_usuarios integer, plan text, notas text,
               created_at timestamptz, admin_email text, usuarios integer, solicitudes integer, obras integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin_plataforma() then raise exception 'sin_permiso' using errcode = '42501'; end if;
  return query
    select e.id, e.nombre, e.estado, public.pres_licencia(e.id), e.vence, e.max_usuarios, e.plan, e.notas, e.created_at,
           (select m.email from public.pres_miembros m where m.empresa_id = e.id and m.rol = 'admin' order by m.created_at limit 1),
           (select count(*)::int from public.pres_miembros m where m.empresa_id = e.id and m.rol <> 'pendiente'),
           (select count(*)::int from public.pres_miembros m where m.empresa_id = e.id and m.rol = 'pendiente'),
           (select count(*)::int from public.pres_registros r where r.empresa_id = e.id and not r.eliminado and r.data->>'tipo' = 'cotizacion')
    from public.pres_empresas e
    order by (e.estado = 'pendiente') desc, e.created_at desc;
end $$;

create or replace function public.pres_plataforma_actualizar_empresa(
  p_empresa uuid, p_estado text, p_vence date, p_max_usuarios integer, p_plan text default null, p_notas text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin_plataforma() then raise exception 'sin_permiso' using errcode = '42501'; end if;
  if p_estado not in ('pendiente', 'activa', 'suspendida') then raise exception 'estado_invalido' using errcode = '22023'; end if;
  update public.pres_empresas
     set estado = p_estado, vence = p_vence, max_usuarios = p_max_usuarios, plan = p_plan, notas = p_notas
   where id = p_empresa;
end $$;

revoke execute on function public.pres_mi_rol(uuid), public.pres_licencia(uuid), public.pres_es_activo(uuid), public.pres_puede_escribir(uuid),
  public.pres_crear_empresa(text), public.pres_unirse_empresa(text), public.pres_regenerar_codigo(uuid),
  public.pres_cambiar_rol(uuid, uuid, text), public.pres_quitar_miembro(uuid, uuid),
  public.pres_guardar_registro(uuid, text, jsonb, integer, boolean), public.pres_mis_empresas(),
  public.pres_plataforma_empresas(), public.pres_plataforma_actualizar_empresa(uuid, text, date, integer, text, text)
  from public, anon;
grant execute on function public.pres_mi_rol(uuid), public.pres_licencia(uuid), public.pres_es_activo(uuid), public.pres_puede_escribir(uuid),
  public.pres_crear_empresa(text), public.pres_unirse_empresa(text), public.pres_regenerar_codigo(uuid),
  public.pres_cambiar_rol(uuid, uuid, text), public.pres_quitar_miembro(uuid, uuid),
  public.pres_guardar_registro(uuid, text, jsonb, integer, boolean), public.pres_mis_empresas(),
  public.pres_plataforma_empresas(), public.pres_plataforma_actualizar_empresa(uuid, text, date, integer, text, text)
  to authenticated;
