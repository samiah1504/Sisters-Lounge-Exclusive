-- ============================================================================
-- 0019 — SALONS (v3 §4.1, §4.7)
-- Multi-salon foundation: one brand, many company-owned Sisters Lounge
-- Salons. Location dimension, NOT multi-tenancy. Creates the Ilorin salon
-- and copies today's global hours/blackouts/settings into it so later
-- migrations can backfill every existing row against it.
-- ============================================================================

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  city text not null,
  state text not null,
  address text not null default '',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  phone text,
  whatsapp text,
  photos text[] not null default '{}',
  chair_capacity integer not null default 3 check (chair_capacity between 1 and 50),
  status text not null default 'planned'
    check (status in ('planned', 'waitlist', 'open', 'paused', 'closed')),
  launch_date date,
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_salons_updated before update on public.salons
for each row execute function public.set_updated_at();

-- Per-salon opening hours (replaces global business_hours).
create table public.salon_hours (
  salon_id uuid not null references public.salons (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0 = Sunday
  is_open boolean not null default true,
  open_time time not null default '09:00',
  close_time time not null default '18:00',
  updated_at timestamptz not null default now(),
  primary key (salon_id, day_of_week),
  check (close_time > open_time)
);

create trigger trg_salon_hours_updated before update on public.salon_hours
for each row execute function public.set_updated_at();

-- Per-salon blackout dates (replaces global blackout_dates).
create table public.salon_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  date date not null,
  reason text not null default '',
  is_full_day boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  check (is_full_day or (start_time is not null and end_time is not null
                         and end_time > start_time))
);

create index idx_salon_blackout on public.salon_blackout_dates (salon_id, date);

-- Per-salon operational settings (v3 §4.7 settings split).
-- Brand-level scheduling_settings keeps notice/advance/reschedule defaults;
-- these are the per-salon values, with nullable brand-default overrides.
create table public.salon_settings (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  slot_duration_minutes integer not null default 30
    check (slot_duration_minutes in (15, 20, 30, 45, 60)),
  max_bookings_per_slot integer not null default 3
    check (max_bookings_per_slot between 1 and 20),
  no_show_grace_minutes integer not null default 20
    check (no_show_grace_minutes between 0 and 120),
  min_booking_notice_hours integer
    check (min_booking_notice_hours between 0 and 168),   -- null = brand default
  max_advance_booking_days integer
    check (max_advance_booking_days between 1 and 180),   -- null = brand default
  updated_at timestamptz not null default now()
);

create trigger trg_salon_settings_updated before update on public.salon_settings
for each row execute function public.set_updated_at();

-- Staff ↔ salon scoping (v3 §4.6). Every role below admin is scoped to
-- one or more salons; is_primary marks a stylist's home salon.
create table public.staff_salon_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, salon_id)
);

create index idx_ssa_salon on public.staff_salon_assignments (salon_id);

-- Expansion waitlist (v3 §3.3): per-city signup capture for coming-soon
-- salons. Powers "launch a salon with members already committed".
create table public.city_waitlist (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  salon_id uuid references public.salons (id) on delete set null,
  full_name text not null default '',
  contact text not null,
  contact_type text not null default 'whatsapp'
    check (contact_type in ('whatsapp', 'email')),
  created_at timestamptz not null default now(),
  unique (city, contact)
);

-- ---------------------------------------------------------------------------
-- Create the Ilorin salon (fixed id so later backfills can reference it)
-- and copy the current global configuration into it.
-- ---------------------------------------------------------------------------
insert into public.salons
  (id, name, slug, city, state, address, chair_capacity, status, launch_date)
values
  ('77770001-0000-0000-0000-000000000001', 'Sisters Lounge Salon Ilorin',
   'ilorin', 'Ilorin', 'Kwara', 'Ilorin, Kwara State', 3, 'open', current_date);

insert into public.salon_hours (salon_id, day_of_week, is_open, open_time, close_time)
select '77770001-0000-0000-0000-000000000001', day_of_week, is_open, open_time, close_time
from public.business_hours;

insert into public.salon_blackout_dates
  (salon_id, date, reason, is_full_day, start_time, end_time)
select '77770001-0000-0000-0000-000000000001', date, reason, is_full_day,
       start_time, end_time
from public.blackout_dates;

insert into public.salon_settings (salon_id, slot_duration_minutes, max_bookings_per_slot)
select '77770001-0000-0000-0000-000000000001',
       s.slot_duration_minutes, s.max_bookings_per_slot
from public.scheduling_settings s;

-- Every existing staff/admin account works at Ilorin today.
insert into public.staff_salon_assignments (profile_id, salon_id, is_primary)
select p.id, '77770001-0000-0000-0000-000000000001', true
from public.profiles p
where p.role in ('staff', 'admin');
