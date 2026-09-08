-- ============================================================
--  BLUEPRINT CRM — esquema de Supabase
--  Pégalo completo en: Supabase → SQL Editor → New query → Run
--  Es idempotente: si lo corres dos veces no rompe nada.
-- ============================================================

-- ---------- 1. TABLAS ----------

-- Cada lead se guarda como el mismo objeto que usa la app, en jsonb.
-- Así no hay que mapear campos ni migrar la tabla cada vez que se añade uno.
create table if not exists public.leads (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Documentos sueltos: config/settings, metrics/touches, metrics/manual, sync/last
create table if not exists public.kv (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Quién es setter y quién es closer
create table if not exists public.profiles (
  id     uuid primary key references auth.users(id) on delete cascade,
  email  text,
  rol    text not null default 'closer' check (rol in ('setter','closer'))
);

-- Cuando alguien se registra, se le crea su perfil automáticamente (como closer).
-- Al setter lo asciendes a mano más abajo.
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, rol)
  values (new.id, new.email, 'closer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.on_auth_user_created();


-- ---------- 2. QUIÉN SOY ----------

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.profiles where id = auth.uid()), 'closer')
$$;


-- ---------- 3. EL CANDADO DEL CLOSER ----------
-- El closer solo puede tocar el resultado de la llamada. Si intenta cambiar
-- un handle, un tag, una fecha de agenda o una nota, la base lo rechaza.
-- Esto NO es el botón escondido en la interfaz: es Postgres diciendo que no.

create or replace function public.guardia_leads()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rol    text := public.mi_rol();
  campo  text;
  -- lo único que el closer puede escribir
  suyos  text[] := array[
    'show','showAt','cierre','cierreAt','importe','oferta','objecion',
    'estado','updatedAt'
  ];
begin
  -- El robot de sincronizacion entra con la service_role: no tiene usuario, asi
  -- que auth.uid() es nulo y mi_rol() caeria en 'closer' por defecto. Sin esta
  -- salida el guardia le rechaza escribir agendoAt, show o estado.
  -- Ojo: la service_role SI se salta la RLS, pero NO se salta los triggers.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if rol = 'setter' then
    return new;                       -- el setter manda sobre todo
  end if;

  for campo in
    select k from (
      select jsonb_object_keys(old.data) as k
      union
      select jsonb_object_keys(new.data) as k
    ) t
  loop
    if (old.data -> campo) is distinct from (new.data -> campo)
       and not (campo = any(suyos)) then
      raise exception 'El closer no puede cambiar "%"', campo
        using hint = 'Solo el setter edita ese campo.';
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_guardia_leads on public.leads;
create trigger trg_guardia_leads
  before update on public.leads
  for each row execute function public.guardia_leads();


-- ---------- 4. REGLAS DE ACCESO (RLS) ----------
-- Sin esto, la anon key deja entrar a cualquiera. Con esto, la anon key sola
-- no sirve para nada: hay que estar logueado.

alter table public.leads    enable row level security;
alter table public.kv       enable row level security;
alter table public.profiles enable row level security;

-- LEADS
drop policy if exists leads_ver     on public.leads;
drop policy if exists leads_crear   on public.leads;
drop policy if exists leads_editar  on public.leads;
drop policy if exists leads_borrar  on public.leads;

create policy leads_ver on public.leads
  for select to authenticated using (true);

create policy leads_crear on public.leads
  for insert to authenticated with check (public.mi_rol() = 'setter');

-- El closer sí puede hacer UPDATE; el trigger de arriba decide qué campos.
create policy leads_editar on public.leads
  for update to authenticated using (true) with check (true);

create policy leads_borrar on public.leads
  for delete to authenticated using (public.mi_rol() = 'setter');

-- KV — metas, conteo de toques, toques a mano, rastro de la sincronización
drop policy if exists kv_ver     on public.kv;
drop policy if exists kv_escribir on public.kv;

create policy kv_ver on public.kv
  for select to authenticated using (true);

create policy kv_escribir on public.kv
  for all to authenticated
  using (public.mi_rol() = 'setter')
  with check (public.mi_rol() = 'setter');

-- PROFILES — cada quien ve el suyo; el setter los ve todos
drop policy if exists perfil_ver on public.profiles;

create policy perfil_ver on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.mi_rol() = 'setter');


-- ---------- 5. TIEMPO REAL ----------
-- Para que lo que escribe uno le aparezca al otro sin refrescar.

do $$
begin
  begin
    alter publication supabase_realtime add table public.leads;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.kv;
  exception when duplicate_object then null;
  end;
end $$;


-- ============================================================
--  DESPUÉS DE CORRER ESTO
-- ============================================================
--
--  1. Ve a Authentication → Users → Add user, y crea DOS usuarios
--     con correo y contraseña (marca "Auto Confirm User"):
--
--       · el tuyo    → adsbyblitz@gmail.com
--       · el de tu cliente
--
--  2. Vuelve aquí y corre esta línea con TU correo para ascenderte
--     a setter (tu cliente se queda como closer solo):
--
--       update public.profiles set rol = 'setter'
--       where email = 'adsbyblitz@gmail.com';
--
--  3. Comprueba que quedó bien:
--
--       select email, rol from public.profiles;
--
--     Debe salir tu correo como 'setter' y el de tu cliente como 'closer'.
-- ============================================================
