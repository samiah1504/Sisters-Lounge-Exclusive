-- 0005 Scheduling foundation: business hours, settings, blackout dates,
-- staff working hours, time off, stylist skills.

create table public.business_hours (
  day_of_week integer primary key check (day_of_week between 0 and 6), -- 0 = Sunday
  is_open boolean not null default true,
  open_time time not null default '09:00',
  close_time time not null default '18:00',
  updated_at timestamptz not null default now(),
  check (close_time > open_time)
);

create trigger trg_business_hours_updated before update on public.business_hours
for each row execute function public.set_updated_at();

insert into public.business_hours (day_of_week, is_open, open_time, close_time) values
  (0, false, '12:00', '17:00'), -- Sunday closed by default
  (1, true, '09:00', '18:00'),
  (2, true, '09:00', '18:00'),
  (3, true, '09:00', '18:00'),
  (4, true, '09:00', '18:00'),
  (5, true, '09:00', '18:00'),
  (6, true, '10:00', '19:00'); -- Saturday: weekend booking is available

-- Single-row operational settings table.
create table public.scheduling_settings (
  id boolean primary key default true check (id), -- enforce single row
  slot_duration_minutes integer not null default 30
    check (slot_duration_minutes in (15, 20, 30, 45, 60)),
  max_bookings_per_slot integer not null default 3 check (max_bookings_per_slot between 1 and 20),
  min_booking_notice_hours integer not null default 12 check (min_booking_notice_hours between 0 and 168),
  max_advance_booking_days integer not null default 45 check (max_advance_booking_days between 1 and 180),
  reschedule_deadline_hours integer not null default 24 check (reschedule_deadline_hours between 0 and 168),
  home_service_capacity_per_day integer not null default 2 check (home_service_capacity_per_day between 0 and 50),
  supported_service_areas text[] not null default '{ilorin}',
  updated_at timestamptz not null default now()
);

create trigger trg_sched_settings_updated before update on public.scheduling_settings
for each row execute function public.set_updated_at();

insert into public.scheduling_settings (id) values (true);

create table public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  reason text not null default '',
  is_full_day boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  check (is_full_day or (start_time is not null and end_time is not null and end_time > start_time))
);

create index idx_blackout_date on public.blackout_dates (date);

create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  unique (staff_profile_id, day_of_week, start_time),
  check (end_time > start_time)
);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.stylist_skills (
  staff_profile_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  primary key (staff_profile_id, skill)
);
