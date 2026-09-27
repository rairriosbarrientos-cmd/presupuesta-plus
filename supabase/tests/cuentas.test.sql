-- Pruebas de seguridad de la migración 001_cuentas. Correr con: bash supabase/tests/correr.sh
-- Usuarios: a1 (admin de A), a2 (editor de A), a3 (lector de A), b1 (admin de B), x (sin empresa), ee (dueño de Civil Road).
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@obra.mx'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@obra.mx'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@obra.mx'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@obra.mx'),
  ('00000000-0000-0000-0000-0000000000ff', 'x@obra.mx'),
  ('00000000-0000-0000-0000-0000000000ee', 'dueno@civilroad.mx');
insert into public.plataforma_admins (user_id) values ('00000000-0000-0000-0000-0000000000ee');

create or replace function pg_temp.ok(nombre text) returns void language plpgsql as $$
begin raise notice 'OK  %', nombre; end $$;

-- 1. Sin sesión no se puede crear empresa
set role anon;
do $$ begin
  perform public.pres_crear_empresa('Anon SA');
  raise exception 'FALLO: anon creó empresa';
exception when insufficient_privilege then perform pg_temp.ok('anon no puede crear empresa');
end $$;

-- 2. a1 crea empresa A y queda como admin
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ declare e public.pres_empresas; begin
  e := public.pres_crear_empresa('  Constructora A ');
  if e.nombre <> 'Constructora A' or length(e.codigo_invitacion) <> 8 then raise exception 'FALLO: empresa mal creada'; end if;
  if public.pres_mi_rol(e.id) <> 'admin' then raise exception 'FALLO: creador no es admin'; end if;
  perform set_config('t.empresa_a', e.id::text, false);
  perform set_config('t.codigo_a', e.codigo_invitacion, false);
  perform pg_temp.ok('crear empresa deja al creador como admin');
end $$;

-- 2b. Empresa recién creada queda en revisión: su admin no puede capturar ni usar el panel del dueño
do $$ begin
  if public.pres_licencia(current_setting('t.empresa_a')::uuid) <> 'pendiente' then raise exception 'FALLO: licencia %', public.pres_licencia(current_setting('t.empresa_a')::uuid); end if;
  begin
    perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p0', '{}', 0);
    raise exception 'FALLO: capturó sin licencia';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_a')::uuid, 'activa', null, null);
    raise exception 'FALLO: se activó solo';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.ok('empresa nueva sin licencia no captura ni se activa sola');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee"}', false);
do $$ declare n int; begin
  select count(*) into n from public.pres_plataforma_empresas();
  if n <> 1 then raise exception 'FALLO: dueño ve % empresas', n; end if;
  perform public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_a')::uuid, 'activa', null, 3, 'Pro', 'pagó');
  perform pg_temp.ok('dueño ve todas las empresas y activa la licencia');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);

-- 3. a1 guarda proyecto nuevo (versión 1) y luego lo actualiza (versión 2)
do $$ declare r jsonb; ea uuid := current_setting('t.empresa_a')::uuid; begin
  r := public.pres_guardar_registro(ea, 'p1', '{"nombre":"Carretera"}', 0);
  if not (r->>'ok')::boolean or (r->>'version')::int <> 1 then raise exception 'FALLO insert: %', r; end if;
  r := public.pres_guardar_registro(ea, 'p1', '{"nombre":"Carretera 2"}', 1);
  if not (r->>'ok')::boolean or (r->>'version')::int <> 2 then raise exception 'FALLO update: %', r; end if;
  perform pg_temp.ok('guardar proyecto sube versión');
end $$;

-- 4. Versión vieja devuelve conflicto con los datos del servidor, sin sobrescribir
do $$ declare r jsonb; ea uuid := current_setting('t.empresa_a')::uuid; begin
  r := public.pres_guardar_registro(ea, 'p1', '{"nombre":"viejo"}', 1);
  if (r->>'ok')::boolean or not (r->>'conflicto')::boolean or r->'data'->>'nombre' <> 'Carretera 2' then raise exception 'FALLO: %', r; end if;
  if (select data->>'nombre' from public.pres_registros where id = 'p1') <> 'Carretera 2' then raise exception 'FALLO: sobrescribió'; end if;
  perform pg_temp.ok('conflicto de versión no sobrescribe');
end $$;

-- 5. Escritura directa a tablas bloqueada
do $$ begin
  insert into public.pres_registros (empresa_id, id, data) values (current_setting('t.empresa_a')::uuid, 'directo', '{}');
  raise exception 'FALLO: insert directo permitido';
exception when insufficient_privilege then perform pg_temp.ok('insert directo a proyectos bloqueado');
end $$;
do $$ begin
  update public.pres_miembros set rol = 'admin';
  raise exception 'FALLO: update directo permitido';
exception when insufficient_privilege then perform pg_temp.ok('update directo a miembros bloqueado');
end $$;

-- 6. Datos inválidos rechazados
do $$ begin
  perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p9', '[1,2]', 0);
  raise exception 'FALLO: aceptó arreglo';
exception when invalid_parameter_value then perform pg_temp.ok('datos que no son objeto rechazados');
end $$;

-- 7. b1 crea empresa B; no ve nada de A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
do $$ declare e public.pres_empresas; begin
  e := public.pres_crear_empresa('Constructora B');
  perform set_config('t.empresa_b', e.id::text, false);
  if exists (select 1 from public.pres_empresas where id = current_setting('t.empresa_a')::uuid) then raise exception 'FALLO: B ve empresa A'; end if;
  if exists (select 1 from public.pres_registros where empresa_id = current_setting('t.empresa_a')::uuid) then raise exception 'FALLO: B ve proyectos de A'; end if;
  if exists (select 1 from public.pres_miembros where empresa_id = current_setting('t.empresa_a')::uuid) then raise exception 'FALLO: B ve miembros de A'; end if;
  perform pg_temp.ok('otra empresa no ve empresa, proyectos ni miembros');
end $$;

-- 8. b1 no puede escribir en A (ni nuevo ni encima)
do $$ begin
  perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p1', '{"hack":1}', 2);
  raise exception 'FALLO: B escribió en A';
exception when insufficient_privilege then perform pg_temp.ok('otra empresa no puede escribir proyectos');
end $$;

-- 9. b1 no puede regenerar código, cambiar roles ni quitar miembros de A
do $$ begin
  perform public.pres_regenerar_codigo(current_setting('t.empresa_a')::uuid);
  raise exception 'FALLO';
exception when insufficient_privilege then perform pg_temp.ok('otra empresa no regenera código');
end $$;
do $$ begin
  perform public.pres_quitar_miembro(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a1');
  raise exception 'FALLO';
exception when insufficient_privilege then perform pg_temp.ok('otra empresa no quita miembros');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee"}', false);
select public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_b')::uuid, 'activa', null, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);

-- 10. Proyecto con el mismo id en B no choca con A
do $$ declare r jsonb; begin
  r := public.pres_guardar_registro(current_setting('t.empresa_b')::uuid, 'p1', '{"nombre":"de B"}', 0);
  if (r->>'version')::int <> 1 then raise exception 'FALLO: %', r; end if;
  perform pg_temp.ok('mismo id de proyecto en otra empresa no choca');
end $$;

-- 11. Código inválido
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
do $$ begin
  perform public.pres_unirse_empresa('NOEXISTE');
  raise exception 'FALLO';
exception when no_data_found then perform pg_temp.ok('código de invitación inválido rechazado');
end $$;

-- 12. a2 usa el código (minúsculas y espacios, dos veces): queda pendiente y no ve nada
do $$ declare e public.pres_empresas; n int; begin
  e := public.pres_unirse_empresa('  ' || lower(current_setting('t.codigo_a')) || ' ');
  e := public.pres_unirse_empresa(current_setting('t.codigo_a'));
  if public.pres_mi_rol(e.id) <> 'pendiente' then raise exception 'FALLO: rol %', public.pres_mi_rol(e.id); end if;
  if exists (select 1 from public.pres_registros) then raise exception 'FALLO: pendiente ve proyectos'; end if;
  if exists (select 1 from public.pres_empresas) then raise exception 'FALLO: pendiente ve la empresa'; end if;
  select count(*) into n from public.pres_miembros;
  if n <> 1 then raise exception 'FALLO: pendiente ve % miembros (debe ver solo su solicitud)', n; end if;
  perform pg_temp.ok('código solo crea solicitud pendiente, sin acceso a datos');
end $$;
do $$ declare r record; begin
  select * into r from public.pres_mis_empresas();
  if r.rol <> 'pendiente' or r.codigo is not null or r.nombre <> 'Constructora A' then raise exception 'FALLO: %', r; end if;
  perform pg_temp.ok('pendiente ve nombre de la empresa pero no el código');
end $$;
do $$ begin
  perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p1', '{"x":1}', 2);
  raise exception 'FALLO: pendiente escribió';
exception when insufficient_privilege then perform pg_temp.ok('pendiente no puede escribir');
end $$;
do $$ begin
  perform public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a2', 'editor');
  raise exception 'FALLO: pendiente se aprobó solo';
exception when insufficient_privilege then perform pg_temp.ok('pendiente no puede aprobarse solo');
end $$;

-- 12b. El admin ve la solicitud, no puede regresar a nadie a pendiente, y aprueba como editor
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ begin
  if not exists (select 1 from public.pres_miembros where rol = 'pendiente') then raise exception 'FALLO: admin no ve solicitudes'; end if;
  begin
    perform public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a2', 'pendiente');
    raise exception 'FALLO: aceptó pendiente como rol';
  exception when invalid_parameter_value then null;
  end;
  perform public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a2', 'editor');
  perform pg_temp.ok('admin ve solicitudes y aprueba');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
do $$ declare r record; begin
  if (select count(*) from public.pres_registros) <> 1 then raise exception 'FALLO: aprobado no ve proyectos'; end if;
  select * into r from public.pres_mis_empresas();
  if r.codigo is null then raise exception 'FALLO: aprobado no recibe código'; end if;
  perform pg_temp.ok('ya aprobado ve proyectos de su empresa');
end $$;

-- 13. Editor guarda, pero no administra
do $$ declare r jsonb; ea uuid := current_setting('t.empresa_a')::uuid; begin
  r := public.pres_guardar_registro(ea, 'p1', '{"nombre":"editado por a2"}', 2);
  if (r->>'version')::int <> 3 then raise exception 'FALLO: %', r; end if;
  begin
    perform public.pres_cambiar_rol(ea, '00000000-0000-0000-0000-0000000000a2', 'admin');
    raise exception 'FALLO: editor se hizo admin';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.ok('editor guarda proyectos pero no cambia roles');
end $$;

-- 14. a3 se une y admin lo pasa a lector; lector lee pero no escribe
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
select public.pres_unirse_empresa(current_setting('t.codigo_a')) is not null as unido \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
-- Aprobar directo como lector
select public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a3', 'lector');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
do $$ begin
  if (select count(*) from public.pres_registros) <> 1 then raise exception 'FALLO: lector no ve'; end if;
  perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p1', '{}', 3);
  raise exception 'FALLO: lector escribió';
exception when insufficient_privilege then perform pg_temp.ok('lector ve pero no escribe');
end $$;

-- 15. Usuario sin empresa no ve nada y no puede llamar mi_rol para espiar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff"}', false);
do $$ begin
  if exists (select 1 from public.pres_empresas) or exists (select 1 from public.pres_registros) or exists (select 1 from public.pres_miembros) then
    raise exception 'FALLO: sin empresa ve datos';
  end if;
  if public.pres_mi_rol(current_setting('t.empresa_a')::uuid) is not null then raise exception 'FALLO'; end if;
  perform pg_temp.ok('usuario sin empresa no ve nada');
end $$;

-- 16. No se puede dejar la empresa sin admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ begin
  perform public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'editor');
  raise exception 'FALLO';
exception when check_violation then perform pg_temp.ok('último admin no puede bajarse de rol');
end $$;
do $$ begin
  perform public.pres_quitar_miembro(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a1');
  raise exception 'FALLO';
exception when check_violation then perform pg_temp.ok('último admin no puede salirse');
end $$;

-- 17. Admin regenera código: el viejo deja de servir
do $$ declare nuevo text; begin
  nuevo := public.pres_regenerar_codigo(current_setting('t.empresa_a')::uuid);
  if nuevo = current_setting('t.codigo_a') then raise exception 'FALLO: mismo código'; end if;
  perform set_config('t.codigo_a2', nuevo, false);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
do $$ begin
  perform public.pres_unirse_empresa(current_setting('t.codigo_a'));
  raise exception 'FALLO: código viejo sirvió';
exception when no_data_found then perform pg_temp.ok('código regenerado invalida el anterior');
end $$;

-- 18. Editor puede salirse solo; luego ya no ve nada
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
do $$ begin
  perform public.pres_quitar_miembro(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000a2');
  if exists (select 1 from public.pres_registros) then raise exception 'FALLO: sigue viendo'; end if;
  perform pg_temp.ok('miembro que sale deja de ver proyectos');
end $$;

-- 19. Borrado suave: se guarda como eliminado y se conserva la versión
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ declare r jsonb; begin
  r := public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p1', '{"nombre":"editado por a2"}', 3, true);
  if (r->>'version')::int <> 4 or not (select eliminado from public.pres_registros where id = 'p1' and empresa_id = current_setting('t.empresa_a')::uuid) then
    raise exception 'FALLO: %', r;
  end if;
  perform pg_temp.ok('borrado suave sube versión y marca eliminado');
end $$;

-- 20. Límite de usuarios contratado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee"}', false);
select public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_a')::uuid, 'activa', null, 2);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff"}', false);
select public.pres_unirse_empresa(current_setting('t.codigo_a2')) is not null as unido2 \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ begin
  perform public.pres_cambiar_rol(current_setting('t.empresa_a')::uuid, '00000000-0000-0000-0000-0000000000ff', 'editor');
  raise exception 'FALLO: pasó el límite de usuarios';
exception when check_violation then perform pg_temp.ok('no se aprueba a nadie arriba del límite de usuarios');
end $$;

-- 21. Licencia vencida: se ve pero no se captura
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee"}', false);
select public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_a')::uuid, 'activa', current_date - 1, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ declare r record; begin
  if not exists (select 1 from public.pres_registros) then raise exception 'FALLO: vencida no ve sus datos'; end if;
  select * into r from public.pres_mis_empresas() where id = current_setting('t.empresa_a')::uuid;
  if r.licencia <> 'vencida' then raise exception 'FALLO: licencia %', r.licencia; end if;
  begin
    perform public.pres_guardar_registro(current_setting('t.empresa_a')::uuid, 'p2', '{}', 0);
    raise exception 'FALLO: vencida capturó';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.ok('licencia vencida: ve sus datos pero no captura');
end $$;

-- 22. Suspendida: sin acceso
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee"}', false);
select public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_a')::uuid, 'suspendida', null, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ declare r record; begin
  if exists (select 1 from public.pres_registros) or exists (select 1 from public.pres_empresas where id = current_setting('t.empresa_a')::uuid) then raise exception 'FALLO: suspendida ve datos'; end if;
  select * into r from public.pres_mis_empresas() where id = current_setting('t.empresa_a')::uuid;
  if r.licencia <> 'suspendida' or r.codigo is not null then raise exception 'FALLO: %', r; end if;
  perform pg_temp.ok('empresa suspendida no ve nada ni recibe código');
end $$;

-- 23. Solo el dueño usa el panel de la plataforma
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
do $$ begin
  perform * from public.pres_plataforma_empresas();
  raise exception 'FALLO: no-dueño vio el panel';
exception when insufficient_privilege then perform pg_temp.ok('solo el dueño ve el panel de empresas');
end $$;
do $$ begin
  perform public.pres_plataforma_actualizar_empresa(current_setting('t.empresa_b')::uuid, 'activa', null, null);
  raise exception 'FALLO';
exception when insufficient_privilege then perform pg_temp.ok('solo el dueño cambia licencias');
end $$;

reset role;
