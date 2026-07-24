-- 0003 Catalogue: organisations, categories, services, plans, plan versions,
-- plan-service associations, extra services and eligibility.

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organisations (name) values ('Sisters Lounge');

-- ------------------------------------------------- subscription categories --
create table public.subscription_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  short_description text not null default '',
  full_description text not null default '',
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  is_public boolean not null default true,
  eligibility_notes text not null default '',
  service_location_type text not null default 'salon'
    check (service_location_type in ('salon', 'home', 'both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_categories_updated before update on public.subscription_categories
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- services --
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '',
  category text not null default 'general',
  estimated_duration_minutes integer not null default 60
    check (estimated_duration_minutes between 5 and 600),
  is_active boolean not null default true,
  salon_available boolean not null default true,
  home_available boolean not null default false,
  eligible_age_group text not null default 'all'
    check (eligible_age_group in ('all', 'adults', 'children')),
  required_skill text,
  image_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_services_updated before update on public.services
for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------- plans --
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  category_id uuid not null references public.subscription_categories (id),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  plan_code text not null unique,
  tier_label text not null default '',
  short_description text not null default '',
  full_description text not null default '',
  monthly_price_kobo bigint not null check (monthly_price_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  visits_included integer not null check (visits_included between 1 and 31),
  min_visit_interval_days integer not null default 7
    check (min_visit_interval_days between 0 and 30),
  location_type text not null default 'salon'
    check (location_type in ('salon', 'home', 'both')),
  eligible_age_group text not null default 'all'
    check (eligible_age_group in ('all', 'adults', 'children')),
  eligibility_notes text not null default '',
  available_days integer[] not null default '{0,1,2,3,4,5,6}',
  is_featured boolean not null default false,
  is_public boolean not null default true,
  display_order integer not null default 0,
  subscriber_limit integer check (subscriber_limit > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'hidden', 'closed', 'archived')),
  image_url text,
  terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index idx_plans_category on public.subscription_plans (category_id);
create index idx_plans_status on public.subscription_plans (status);

create trigger trg_plans_updated before update on public.subscription_plans
for each row execute function public.set_updated_at();

-- Immutable snapshots so future price/benefit changes never rewrite history.
create table public.subscription_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  version_number integer not null,
  monthly_price_kobo bigint not null,
  visits_included integer not null,
  min_visit_interval_days integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);

-- Snapshot every insert and every material change into plan_versions.
create or replace function public.snapshot_plan_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
begin
  if tg_op = 'UPDATE'
     and new.monthly_price_kobo = old.monthly_price_kobo
     and new.visits_included = old.visits_included
     and new.min_visit_interval_days = old.min_visit_interval_days
     and new.terms = old.terms then
    return new; -- cosmetic change, no new version
  end if;
  select coalesce(max(version_number), 0) + 1 into v_next
  from public.subscription_plan_versions where plan_id = new.id;
  insert into public.subscription_plan_versions
    (plan_id, version_number, monthly_price_kobo, visits_included,
     min_visit_interval_days, snapshot)
  values
    (new.id, v_next, new.monthly_price_kobo, new.visits_included,
     new.min_visit_interval_days, to_jsonb(new));
  return new;
end $$;

create trigger trg_plan_version after insert or update on public.subscription_plans
for each row execute function public.snapshot_plan_version();

create or replace function public.latest_plan_version(p_plan_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.subscription_plan_versions
  where plan_id = p_plan_id
  order by version_number desc limit 1
$$;

create table public.subscription_plan_services (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  relation text not null default 'included'
    check (relation in ('included', 'excluded', 'optional', 'restricted')),
  primary key (plan_id, service_id)
);

-- ------------------------------------------------------------ extra services --
create table public.extra_service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.extra_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '',
  short_description text not null default '',
  price_kobo bigint not null check (price_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  estimated_duration_minutes integer not null default 30
    check (estimated_duration_minutes between 5 and 480),
  category_id uuid references public.extra_service_categories (id),
  image_url text,
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_featured boolean not null default false,
  salon_available boolean not null default true,
  home_available boolean not null default false,
  required_skill text,
  min_advance_notice_hours integer not null default 0
    check (min_advance_notice_hours between 0 and 336),
  payment_requirement text not null default 'pay_at_salon'
    check (payment_requirement in ('pay_before_confirmation', 'pay_at_salon', 'admin_decides')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_extra_services_updated before update on public.extra_services
for each row execute function public.set_updated_at();

-- Empty eligibility tables mean "eligible for all plans / categories".
create table public.extra_service_plan_eligibility (
  extra_service_id uuid not null references public.extra_services (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  primary key (extra_service_id, plan_id)
);

create table public.extra_service_customer_eligibility (
  extra_service_id uuid not null references public.extra_services (id) on delete cascade,
  category_id uuid not null references public.subscription_categories (id) on delete cascade,
  primary key (extra_service_id, category_id)
);

create or replace function public.is_extra_service_eligible(
  p_extra uuid, p_plan uuid, p_category uuid, p_location text
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.extra_services es
    where es.id = p_extra
      and es.is_active and es.archived_at is null
      and (case when p_location = 'home' then es.home_available else es.salon_available end)
      and (not exists (select 1 from public.extra_service_plan_eligibility e
                       where e.extra_service_id = es.id)
           or exists (select 1 from public.extra_service_plan_eligibility e
                      where e.extra_service_id = es.id and e.plan_id = p_plan))
      and (not exists (select 1 from public.extra_service_customer_eligibility e
                       where e.extra_service_id = es.id)
           or exists (select 1 from public.extra_service_customer_eligibility e
                      where e.extra_service_id = es.id and e.category_id = p_category))
  )
$$;
