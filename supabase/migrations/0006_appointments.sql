-- 0006 Appointments: bookings, add-ons, status/reschedule/assignment history.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id),
  child_id uuid references public.children (id),
  subscription_id uuid references public.subscriptions (id),
  cycle_id uuid references public.subscription_cycles (id),
  service_id uuid not null references public.services (id),
  location_type text not null default 'salon' check (location_type in ('salon', 'home')),
  home_address jsonb, -- snapshot {address, city, state, area} for home service
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  status text not null default 'pending_confirmation'
    check (status in ('draft', 'pending_addon_payment', 'pending_confirmation',
                      'confirmed', 'assigned', 'arrived', 'in_service', 'completed',
                      'rescheduled', 'missed', 'cancelled_salon', 'cancelled_admin',
                      'no_longer_eligible', 'expired')),
  stylist_profile_id uuid references public.profiles (id),
  customer_notes text not null default '',
  addon_total_kobo bigint not null default 0 check (addon_total_kobo >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (location_type = 'salon' or home_address is not null)
);

create index idx_appointments_customer on public.appointments (customer_id);
create index idx_appointments_starts on public.appointments (starts_at);
create index idx_appointments_status on public.appointments (status);
create index idx_appointments_stylist on public.appointments (stylist_profile_id, starts_at);
create index idx_appointments_subscription on public.appointments (subscription_id);

create trigger trg_appointments_updated before update on public.appointments
for each row execute function public.set_updated_at();

-- Stylist double-booking protection: a stylist cannot have two overlapping
-- live appointments.
alter table public.appointments add constraint no_stylist_double_booking
  exclude using gist (
    stylist_profile_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (stylist_profile_id is not null
         and status in ('assigned', 'arrived', 'in_service', 'confirmed'));

-- Late FKs from 0004
alter table public.visit_reservations
  add constraint fk_reservation_appointment
  foreign key (appointment_id) references public.appointments (id) on delete cascade;

alter table public.pending_payment_intents
  add constraint fk_intent_appointment
  foreign key (appointment_id) references public.appointments (id) on delete set null;

-- ------------------------------------------------------------------ add-ons --
create table public.appointment_extra_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  extra_service_id uuid not null references public.extra_services (id),
  price_kobo bigint not null check (price_kobo >= 0), -- snapshot at booking time
  duration_minutes integer not null,                   -- snapshot at booking time
  payment_requirement text not null,
  status text not null default 'selected' check (status in ('selected', 'removed')),
  created_at timestamptz not null default now(),
  unique (appointment_id, extra_service_id)
);

-- ------------------------------------------------------------------ history --
create table public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_profile_id uuid references public.profiles (id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_appt_history_appt on public.appointment_status_history (appointment_id);

create or replace function public.log_appointment_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.appointment_status_history
      (appointment_id, previous_status, new_status, actor_profile_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_appointment_status after insert or update on public.appointments
for each row execute function public.log_appointment_status();

create table public.appointment_reschedule_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  actor_profile_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

create table public.stylist_assignment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  previous_stylist_id uuid references public.profiles (id),
  new_stylist_id uuid references public.profiles (id),
  actor_profile_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

create table public.appointment_internal_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id),
  note text not null check (length(note) > 0),
  created_at timestamptz not null default now()
);
