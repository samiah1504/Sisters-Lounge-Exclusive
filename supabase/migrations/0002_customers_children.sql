-- 0002 Customer profiles and child profiles.

create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  whatsapp_number text,
  address text,
  city text,
  state text,
  preferred_contact_method text not null default 'whatsapp'
    check (preferred_contact_method in ('phone', 'whatsapp', 'email')),
  service_area text not null default 'ilorin',
  service_area_confirmed boolean not null default false,
  marketing_consent boolean not null default false,
  notification_preferences jsonb not null default
    '{"booking_reminders": true, "renewal_reminders": true, "promotions": false}'::jsonb,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_customer_profiles_updated before update on public.customer_profiles
for each row execute function public.set_updated_at();

-- Customers may not touch account status fields.
create or replace function public.guard_customer_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.account_status is distinct from old.account_status
      or new.archived_at is distinct from old.archived_at
      or new.profile_id is distinct from old.profile_id)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'not allowed to change account status';
  end if;
  return new;
end $$;

create trigger trg_customer_profiles_guard before update on public.customer_profiles
for each row execute function public.guard_customer_profile_update();

-- Auto-create the customer profile when a customer-role profile appears.
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'customer' then
    insert into public.customer_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_profile_created after insert on public.profiles
for each row execute function public.handle_new_profile();

create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.customer_profiles where profile_id = auth.uid()
$$;

-- A profile is booking-ready when the required fields are complete.
create or replace function public.is_profile_booking_ready(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.id = p_customer_id
      and coalesce(p.full_name, '') <> ''
      and coalesce(p.phone, '') <> ''
      and coalesce(cp.whatsapp_number, '') <> ''
      and coalesce(cp.address, '') <> ''
      and coalesce(cp.city, '') <> ''
      and coalesce(cp.state, '') <> ''
      and cp.service_area_confirmed
  )
$$;

-- ---------------------------------------------------------------- children --
create table public.children (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  date_of_birth date not null check (date_of_birth <= current_date),
  gender text check (gender in ('female', 'male')),
  photo_url text,
  allergies text not null default '',
  sensitivities text not null default '',
  hair_scalp_notes text not null default '',
  service_notes text not null default '',
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_children_customer on public.children (customer_id);

create trigger trg_children_updated before update on public.children
for each row execute function public.set_updated_at();

-- ------------------------------------------------- tags and internal notes --
create table public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#a72c66',
  created_at timestamptz not null default now()
);

create table public.customer_tag_assignments (
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  tag_id uuid not null references public.customer_tags (id) on delete cascade,
  assigned_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create table public.customer_internal_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id),
  note text not null check (length(note) > 0),
  created_at timestamptz not null default now()
);

create index idx_internal_notes_customer on public.customer_internal_notes (customer_id);
