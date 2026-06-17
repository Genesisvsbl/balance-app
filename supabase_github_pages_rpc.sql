create extension if not exists pgcrypto;

create or replace function public.login_app_user(login_text text, login_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_login text;
  normalized_dots text;
  matched_user public.app_users%rowtype;
  valid_login boolean;
begin
  normalized_login := lower(trim(coalesce(login_text, '')));
  normalized_dots := replace(normalized_login, ' ', '.');

  select *
    into matched_user
  from public.app_users
  where active = true
    and (
      lower(username) = normalized_login
      or lower(full_name) = normalized_login
      or replace(lower(full_name), ' ', '.') = normalized_dots
    )
  limit 1;

  valid_login :=
    matched_user.id is not null
    and encode(
      digest(convert_to(matched_user.password_salt || ':' || coalesce(login_password, ''), 'UTF8'), 'sha256'),
      'hex'
    ) = matched_user.password_hash;

  insert into public.audit_events (user_id, username, action, entity, entity_id, details)
  values (
    case when matched_user.id is null then null else matched_user.id end,
    normalized_login,
    case when valid_login then 'LOGIN_SUCCESS' else 'LOGIN_FAILED' end,
    'session',
    case when matched_user.id is null then null else matched_user.id::text end,
    '{}'::jsonb
  );

  if not valid_login then
    raise exception 'Usuario o contrasena incorrectos.';
  end if;

  update public.app_users
  set last_login_at = now()
  where id = matched_user.id;

  return jsonb_build_object(
    'user',
    jsonb_build_object(
      'id', matched_user.id,
      'username', matched_user.username,
      'fullName', matched_user.full_name,
      'role', matched_user.role
    )
  );
end;
$$;

create or replace function public.balance_row_to_json(row_data public.balance_rows)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'codigo', row_data.codigo,
    'material', coalesce(row_data.material, ''),
    'um', coalesce(row_data.um, ''),
    'seccion', coalesce(row_data.seccion, ''),
    'seccionesArray', coalesce(row_data.secciones_array, '{}'),
    'estado', row_data.estado,
    'totalNecesidad', coalesce(row_data.total_necesidad, 0),
    'totalRecepcion', coalesce(row_data.total_recepcion, 0),
    'totalExistencia', coalesce(row_data.total_existencia, 0),
    'diferenciaTotal', coalesce(row_data.diferencia_total, 0),
    'inventarioLibre', coalesce(row_data.inventario_libre, 0),
    'inventarioBloqueado', coalesce(row_data.inventario_bloqueado, 0),
    'stockTotal', coalesce(row_data.stock_total, 0),
    'valorInventarioLibre', coalesce(row_data.valor_inventario_libre, 0),
    'valorInventarioBloqueado', coalesce(row_data.valor_inventario_bloqueado, 0),
    'valorStockTotal', coalesce(row_data.valor_stock_total, 0),
    'necesidadesPorSemana', coalesce(row_data.necesidades_por_semana, '{}'::jsonb),
    'recepcionesPorSemana', coalesce(row_data.recepciones_por_semana, '{}'::jsonb),
    'fechasRecepcionPorSemana', coalesce(row_data.fechas_recepcion_por_semana, '{}'::jsonb),
    'transitosPorSemana', coalesce(row_data.transitos_por_semana, '{}'::jsonb),
    'coberturaPorSemana', coalesce(row_data.cobertura_por_semana, '{}'::jsonb),
    'almacenes', coalesce(row_data.almacenes, '{}'::jsonb),
    'diferenciasPorSemana', coalesce(row_data.diferencias_por_semana, '{}'::jsonb)
  );
$$;

create or replace function public.get_balance_loads()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(load_data order by created_at desc), '[]'::jsonb)
  from (
    select
      r.created_at,
      jsonb_build_object(
        'id', r.id,
        'fecha', r.created_at,
        'archivo', r.archivo,
        'hojas', coalesce(r.hojas, '{}'),
        'info', r.info,
        'createdBy',
          case
            when u.id is null then null
            else jsonb_build_object('id', u.id, 'username', u.username, 'fullName', u.full_name)
          end,
        'analisis',
          coalesce(
            (
              select jsonb_agg(public.balance_row_to_json(br) order by br.codigo)
              from public.balance_rows br
              where br.run_id = r.id
            ),
            '[]'::jsonb
          )
      ) as load_data
    from public.balance_runs r
    left join public.app_users u on u.id = r.created_by
  ) loads;
$$;

create or replace function public.save_balance_load(carga jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_item jsonb;
  v_run_id uuid;
begin
  v_run_id := (carga->>'id')::uuid;

  insert into public.balance_runs (id, created_at, created_by, archivo, hojas, info)
  values (
    v_run_id,
    coalesce((carga->>'fecha')::timestamptz, now()),
    nullif(carga #>> '{createdBy,id}', '')::uuid,
    coalesce(carga->>'archivo', 'Balance de materiales'),
    coalesce(array(select jsonb_array_elements_text(coalesce(carga->'hojas', '[]'::jsonb))), '{}'),
    carga->'info'
  )
  on conflict (id) do update set
    created_at = excluded.created_at,
    created_by = excluded.created_by,
    archivo = excluded.archivo,
    hojas = excluded.hojas,
    info = excluded.info;

  delete from public.balance_rows where run_id = v_run_id;

  for row_item in select * from jsonb_array_elements(coalesce(carga->'analisis', '[]'::jsonb))
  loop
    insert into public.balance_rows (
      run_id, codigo, material, um, seccion, secciones_array, estado,
      total_necesidad, total_recepcion, total_existencia, diferencia_total,
      inventario_libre, inventario_bloqueado, stock_total,
      valor_inventario_libre, valor_inventario_bloqueado, valor_stock_total,
      necesidades_por_semana, recepciones_por_semana, fechas_recepcion_por_semana,
      transitos_por_semana, cobertura_por_semana, almacenes, diferencias_por_semana
    )
    values (
      v_run_id,
      coalesce(row_item->>'codigo', ''),
      row_item->>'material',
      row_item->>'um',
      row_item->>'seccion',
      coalesce(array(select jsonb_array_elements_text(coalesce(row_item->'seccionesArray', '[]'::jsonb))), '{}'),
      coalesce(row_item->>'estado', 'OK'),
      coalesce((row_item->>'totalNecesidad')::numeric, 0),
      coalesce((row_item->>'totalRecepcion')::numeric, 0),
      coalesce((row_item->>'totalExistencia')::numeric, 0),
      coalesce((row_item->>'diferenciaTotal')::numeric, 0),
      coalesce((row_item->>'inventarioLibre')::numeric, 0),
      coalesce((row_item->>'inventarioBloqueado')::numeric, 0),
      coalesce((row_item->>'stockTotal')::numeric, 0),
      coalesce((row_item->>'valorInventarioLibre')::numeric, 0),
      coalesce((row_item->>'valorInventarioBloqueado')::numeric, 0),
      coalesce((row_item->>'valorStockTotal')::numeric, 0),
      coalesce(row_item->'necesidadesPorSemana', '{}'::jsonb),
      coalesce(row_item->'recepcionesPorSemana', '{}'::jsonb),
      coalesce(row_item->'fechasRecepcionPorSemana', '{}'::jsonb),
      coalesce(row_item->'transitosPorSemana', '{}'::jsonb),
      coalesce(row_item->'coberturaPorSemana', '{}'::jsonb),
      coalesce(row_item->'almacenes', '{}'::jsonb),
      coalesce(row_item->'diferenciasPorSemana', '{}'::jsonb)
    );
  end loop;

  insert into public.audit_events (user_id, username, action, entity, entity_id, details)
  values (
    nullif(carga #>> '{createdBy,id}', '')::uuid,
    carga #>> '{createdBy,username}',
    'BALANCE_CREATED',
    'balance_run',
    v_run_id::text,
    jsonb_build_object('archivo', carga->>'archivo', 'hojas', coalesce(carga->'hojas', '[]'::jsonb))
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_balance_load(load_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.balance_runs where id = load_id;
  insert into public.audit_events (action, entity, entity_id, details)
  values ('BALANCE_DELETED', 'balance_run', load_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.clear_balance_loads()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.balance_runs;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.login_app_user(text, text) to anon, authenticated;
grant execute on function public.get_balance_loads() to anon, authenticated;
grant execute on function public.save_balance_load(jsonb) to anon, authenticated;
grant execute on function public.delete_balance_load(uuid) to anon, authenticated;
grant execute on function public.clear_balance_loads() to anon, authenticated;
