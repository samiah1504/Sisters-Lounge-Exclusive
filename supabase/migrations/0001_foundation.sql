-- 0001 Foundation: extensions, helpers, profiles, roles, permissions.
-- Money is stored as integer kobo (1 NGN = 100 kobo). Timezone: Africa/Lagos.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------- helpers --
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles --
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer'
    check (role in ('customer', 'staff', 'admin')),
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

-- Non-admins may never change protected profile fields.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for service-role / seed / definer contexts, which are
  -- trusted; RLS already blocks anonymous users from reaching this trigger.
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'not allowed to change role or account status';
  end if;
  return new;
end $$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('staff','admin') from public.profiles where id = auth.uid()), false)
$$;

create trigger trg_profiles_guard before update on public.profiles
for each row execute function public.guard_profile_update();

-- Auto-create a profile row for each new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- permissions --
create table public.permissions (
  key text primary key,
  description text not null default ''
);

create table public.role_permissions (
  role text not null check (role in ('staff', 'admin')),
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid() and rp.permission_key = p_key
  )
$$;

insert into public.permissions (key, description) values
  ('plans.view', 'View subscription plans in admin'),
  ('plans.manage', 'Create and edit subscription plans'),
  ('categories.view', 'View subscription categories in admin'),
  ('categories.manage', 'Create and edit subscription categories'),
  ('services.view', 'View services in admin'),
  ('services.manage', 'Create and edit services'),
  ('extra_services.view', 'View extra services in admin'),
  ('extra_services.manage', 'Create and edit extra services'),
  ('subscriptions.view', 'View customer subscriptions'),
  ('subscriptions.manage', 'Create and manage subscriptions'),
  ('subscriptions.adjust_visits', 'Adjust visit balances'),
  ('appointments.view', 'View appointments'),
  ('appointments.create', 'Create appointments on behalf of customers'),
  ('appointments.update', 'Update appointment details and status'),
  ('appointments.assign', 'Assign stylists to appointments'),
  ('appointments.complete', 'Mark appointments completed'),
  ('appointments.cancel', 'Cancel appointments on behalf of the salon'),
  ('consultations.view', 'View consultation bookings'),
  ('consultations.manage', 'Manage consultation types and bookings'),
  ('products.view', 'View products in admin'),
  ('products.manage', 'Create and edit products'),
  ('retention.view', 'View retention dashboards'),
  ('retention.manage', 'Manage retention prompts'),
  ('recommendations.view', 'View recommendation rules'),
  ('recommendations.manage', 'Manage recommendation rules'),
  ('customers.view', 'View customer records'),
  ('customers.manage', 'Edit customer records'),
  ('customers.internal_notes', 'Read and write internal customer notes'),
  ('customers.tags.manage', 'Manage customer tags');

-- Staff get day-to-day operational permissions; admin implicitly has all.
insert into public.role_permissions (role, permission_key) values
  ('staff', 'appointments.view'),
  ('staff', 'appointments.update'),
  ('staff', 'appointments.assign'),
  ('staff', 'appointments.complete'),
  ('staff', 'subscriptions.view'),
  ('staff', 'customers.view'),
  ('staff', 'consultations.view'),
  ('staff', 'retention.view');

-- ---------------------------------------------------------------- audit log --
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on public.audit_log (entity_type, entity_id);

create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_reason text default null, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_reason, p_metadata)
$$;
