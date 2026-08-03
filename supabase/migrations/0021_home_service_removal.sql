-- ============================================================================
-- 0021 — HOME-SERVICE REMOVAL (v3 §4.8, locked decision)
-- Sisters Lounge is salon-visit only. Removes all home-service structure.
-- History stays honest: completed home visits keep was_home_visit = true.
-- Aborts if any live home appointment still exists — resolve those by hand
-- (reschedule to a salon or release) before applying this migration.
-- ============================================================================

do $$
begin
  if exists (
      select 1 from public.appointments
      where location_type = 'home'
        and status = any (public.live_appointment_statuses())) then
    raise exception
      'HOME_VISITS_PENDING: live home-service appointments exist — reschedule or release them before migrating';
  end if;
end $$;

-- ------------------------------------------------------------ appointments --
alter table public.appointments
  add column was_home_visit boolean not null default false;
update public.appointments
  set was_home_visit = true where location_type = 'home';
comment on column public.appointments.was_home_visit is
  'Historical flag: visit happened under the retired home-service model.';

alter table public.appointments drop column location_type cascade;
alter table public.appointments drop column home_address;

-- ------------------------------------------------------------------- plans --
-- Home-only plans can no longer be sold; archive before dropping the column.
update public.subscription_plans
  set status = 'archived', archived_at = coalesce(archived_at, now())
where location_type = 'home';
alter table public.subscription_plans drop column location_type;

-- ---------------------------------------- categories, services, add-ons ----
alter table public.subscription_categories drop column service_location_type;
alter table public.services drop column home_available;
alter table public.services drop column salon_available;
alter table public.extra_services drop column home_available;
alter table public.extra_services drop column salon_available;

-- Eligibility no longer has a location dimension (0022 updates callers).
drop function public.is_extra_service_eligible(uuid, uuid, uuid, text);
create function public.is_extra_service_eligible(
  p_extra uuid, p_plan uuid, p_category uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.extra_services es
    where es.id = p_extra
      and es.is_active and es.archived_at is null
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

-- ----------------------------------------------------------- consultations --
-- Expert Consultations survive (owner ruling C2) as salon or virtual only.
update public.consultation_types set location_type = 'salon'
where location_type = 'home';
alter table public.consultation_types
  drop constraint consultation_types_location_type_check;
alter table public.consultation_types
  add constraint consultation_types_location_type_check
  check (location_type in ('salon', 'virtual'));

-- ---------------------------------------------------------------- settings --
alter table public.scheduling_settings drop column home_service_capacity_per_day;
alter table public.scheduling_settings drop column supported_service_areas;

alter table public.subscription_capacity_settings
  drop column home_service_subscriber_limit;

-- --------------------------------------------------------- member profiles --
-- Address stays (delivery + demographics); zone validation goes.
alter table public.customer_profiles drop column service_area;
alter table public.customer_profiles drop column service_area_confirmed;

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
  )
$$;
