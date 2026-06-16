create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  password_salt text not null,
  password_hash text not null,
  role text not null default 'planner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.app_users(id) on delete set null,
  username text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'
);

create table if not exists public.balance_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  archivo text not null,
  hojas text[] not null default '{}',
  info jsonb,
  total_componentes integer generated always as ((coalesce(info->>'totalComponentes', '0'))::integer) stored,
  total_faltantes integer generated always as ((coalesce(info->>'totalFaltantes', '0'))::integer) stored,
  total_sobrantes integer generated always as ((coalesce(info->>'totalSobrantes', '0'))::integer) stored
);

alter table public.balance_runs
  add column if not exists created_by uuid references public.app_users(id) on delete set null;

create table if not exists public.balance_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.balance_runs(id) on delete cascade,
  codigo text not null,
  material text,
  um text,
  seccion text,
  secciones_array text[] not null default '{}',
  estado text not null check (estado in ('FALTANTE', 'SOBRANTE', 'JUSTO', 'OK')),
  total_necesidad numeric not null default 0,
  total_recepcion numeric not null default 0,
  total_existencia numeric not null default 0,
  diferencia_total numeric not null default 0,
  inventario_libre numeric not null default 0,
  inventario_bloqueado numeric not null default 0,
  stock_total numeric not null default 0,
  valor_inventario_libre numeric not null default 0,
  valor_inventario_bloqueado numeric not null default 0,
  valor_stock_total numeric not null default 0,
  necesidades_por_semana jsonb not null default '{}',
  recepciones_por_semana jsonb not null default '{}',
  fechas_recepcion_por_semana jsonb not null default '{}',
  transitos_por_semana jsonb not null default '{}',
  cobertura_por_semana jsonb not null default '{}',
  almacenes jsonb not null default '{}',
  diferencias_por_semana jsonb not null default '{}'
);

create index if not exists app_users_username_idx on public.app_users (username);
create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_user_id_idx on public.audit_events (user_id);
create index if not exists balance_runs_created_at_idx on public.balance_runs (created_at desc);
create index if not exists balance_runs_created_by_idx on public.balance_runs (created_by);
create index if not exists balance_rows_run_id_idx on public.balance_rows (run_id);
create index if not exists balance_rows_codigo_idx on public.balance_rows (codigo);
create index if not exists balance_rows_estado_idx on public.balance_rows (estado);

insert into public.app_users (username, full_name, password_salt, password_hash, role, active)
values
  (
    'jeremy.griego',
    'Jeremy Griego',
    'be5ce946c0ad00adcf4a93722bf8970a',
    'cfa57a9b6d80f98ed249e7014777e005b2ef23dc1ed304b264ae02b20ce527c9',
    'planner',
    true
  ),
  (
    'genesis.visbal',
    'Genesis Visbal',
    '6728aa204edebd254c75e1f2a6d05850',
    '31d1e41e125d7d03b76fff0229b632b16e8cd9a9729c29381fa6499baa5f636c',
    'admin',
    true
  )
on conflict (username) do update set
  full_name = excluded.full_name,
  password_salt = excluded.password_salt,
  password_hash = excluded.password_hash,
  role = excluded.role,
  active = excluded.active;

alter table public.app_users enable row level security;
alter table public.audit_events enable row level security;
alter table public.balance_runs enable row level security;
alter table public.balance_rows enable row level security;

drop policy if exists "service can manage app users" on public.app_users;
create policy "service can manage app users"
  on public.app_users for all
  using (true)
  with check (true);

drop policy if exists "service can manage audit events" on public.audit_events;
create policy "service can manage audit events"
  on public.audit_events for all
  using (true)
  with check (true);

drop policy if exists "service can manage balance runs" on public.balance_runs;
create policy "service can manage balance runs"
  on public.balance_runs for all
  using (true)
  with check (true);

drop policy if exists "service can manage balance rows" on public.balance_rows;
create policy "service can manage balance rows"
  on public.balance_rows for all
  using (true)
  with check (true);

create or replace function public.login_app_user(
  login_text text,
  login_password text
)
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
      digest(matched_user.password_salt || ':' || coalesce(login_password, ''), 'sha256'),
      'hex'
    ) = matched_user.password_hash;

  insert into public.audit_events (
    user_id,
    username,
    action,
    entity,
    entity_id,
    details
  )
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

grant execute on function public.login_app_user(text, text) to anon;
grant execute on function public.login_app_user(text, text) to authenticated;
