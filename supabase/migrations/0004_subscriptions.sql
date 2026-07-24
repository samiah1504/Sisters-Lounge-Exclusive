-- 0004 Subscription foundation: pending selections, subscriptions, cycles,
-- visit entitlements, visit reservations, status history, payment intents.

create table public.pending_plan_selections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  child_id uuid references public.children (id),
  plan_id uuid not null references public.subscription_plans (id),
  plan_version_id uuid not null references public.subscription_plan_versions (id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'superseded', 'cancelled', 'activated')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_pending_selection_updated before update on public.pending_plan_selections
for each row execute function public.set_updated_at();

-- One live pending selection per customer+recipient.
create unique index uq_pending_selection_live
  on public.pending_plan_selections (customer_id, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending_payment';

-- ----------------------------------------------------------- subscriptions --
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id),
  child_id uuid references public.children (id),
  plan_id uuid not null references public.subscription_plans (id),
  plan_version_id uuid not null references public.subscription_plan_versions (id),
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'active', 'expiring_soon',
                      'renewal_due', 'payment_failed', 'expired', 'opted_out',
                      'suspended', 'cancelled_by_admin', 'archived')),
  opt_out_next_renewal boolean not null default false,
  next_plan_id uuid references public.subscription_plans (id), -- plan change from next cycle
  created_by uuid references public.profiles (id),
  activation_source text not null default 'manual'
    check (activation_source in ('manual', 'payment', 'migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_customer on public.subscriptions (customer_id);
create index idx_subscriptions_status on public.subscriptions (status);

create trigger trg_subscriptions_updated before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.subscription_status_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_profile_id uuid references public.profiles (id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_sub_history_sub on public.subscription_status_history (subscription_id);

create or replace function public.log_subscription_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.subscription_status_history
      (subscription_id, previous_status, new_status, actor_profile_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_subscription_status after insert or update on public.subscriptions
for each row execute function public.log_subscription_status();

-- ------------------------------------------------------------------ cycles --
create table public.subscription_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  cycle_number integer not null check (cycle_number >= 1),
  starts_on date not null,
  ends_on date not null,
  visits_included integer not null check (visits_included between 1 and 31),
  status text not null default 'active'
    check (status in ('upcoming', 'active', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  unique (subscription_id, cycle_number),
  check (ends_on > starts_on)
);

create index idx_cycles_subscription on public.subscription_cycles (subscription_id);

-- ------------------------------------------------------- visit entitlements --
create table public.visit_entitlements (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.subscription_cycles (id) on delete cascade,
  seq_number integer not null check (seq_number >= 1),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'consumed', 'expired', 'revoked')),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, seq_number)
);

create trigger trg_entitlements_updated before update on public.visit_entitlements
for each row execute function public.set_updated_at();

-- ------------------------------------------------------- visit reservations --
-- Reservation audit trail. An entitlement can have at most one ACTIVE
-- reservation (partial unique index); consumption converts it.
create table public.visit_reservations (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.visit_entitlements (id) on delete cascade,
  appointment_id uuid not null, -- FK added in 0006 after appointments exists
  status text not null default 'active'
    check (status in ('active', 'released', 'converted')),
  release_reason text,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index uq_reservation_active_entitlement
  on public.visit_reservations (entitlement_id) where status = 'active';
create unique index uq_reservation_active_appointment
  on public.visit_reservations (appointment_id) where status = 'active';
create index idx_reservations_appointment on public.visit_reservations (appointment_id);

-- ------------------------------------------------------ pending payment intents --
-- Placeholder for the future payment phase. No provider integration exists;
-- these rows only describe what WILL need to be paid.
create table public.pending_payment_intents (
  id uuid primary key default gen_random_uuid(),
  purpose text not null
    check (purpose in ('subscription_activation', 'addon_payment', 'consultation')),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  pending_selection_id uuid references public.pending_plan_selections (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  appointment_id uuid, -- FK added in 0006
  consultation_booking_id uuid, -- FK added in 0007
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending'
    check (status in ('pending', 'superseded', 'cancelled', 'fulfilled_offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payment_intents_customer on public.pending_payment_intents (customer_id);

create trigger trg_payment_intents_updated before update on public.pending_payment_intents
for each row execute function public.set_updated_at();
