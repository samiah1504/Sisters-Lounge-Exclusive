-- 0009 Transaction-safe business functions. These are the ONLY write paths
-- for entitlements, reservations and appointment lifecycle. All run as
-- SECURITY DEFINER and re-check authorisation internally.

set search_path = public;

-- Local timezone for all "day" calculations.
create or replace function public.lagos_date(p timestamptz)
returns date language sql immutable as $$
  select (p at time zone 'Africa/Lagos')::date
$$;

create or replace function public.lagos_time(p timestamptz)
returns time language sql immutable as $$
  select (p at time zone 'Africa/Lagos')::time
$$;

-- Appointment statuses that occupy capacity / count for the interval rule.
create or replace function public.live_appointment_statuses()
returns text[] language sql immutable as $$
  select array['pending_addon_payment','pending_confirmation','confirmed',
               'assigned','arrived','in_service','completed']
$$;

-- ---------------------------------------------------------------------------
-- Plan selection (customer): create/replace a pending selection. No payment.
-- ---------------------------------------------------------------------------
create or replace function public.fn_select_plan(p_plan_id uuid, p_child_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := public.current_customer_id();
  v_plan public.subscription_plans;
  v_selection uuid;
begin
  if v_customer is null then
    raise exception 'no customer profile for current user';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found or v_plan.status <> 'active' or not v_plan.is_public then
    raise exception 'plan is not open for selection';
  end if;

  if p_child_id is not null and not exists (
      select 1 from public.children c
      where c.id = p_child_id and c.customer_id = v_customer and c.is_active) then
    raise exception 'child does not belong to this customer';
  end if;

  -- Supersede any existing live selection for the same recipient.
  update public.pending_plan_selections
     set status = 'superseded'
   where customer_id = v_customer
     and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and status = 'pending_payment';

  update public.pending_payment_intents set status = 'superseded'
   where customer_id = v_customer and purpose = 'subscription_activation'
     and status = 'pending';

  insert into public.pending_plan_selections (customer_id, child_id, plan_id, plan_version_id)
  values (v_customer, p_child_id, p_plan_id, public.latest_plan_version(p_plan_id))
  returning id into v_selection;

  insert into public.pending_payment_intents
    (purpose, customer_id, pending_selection_id, amount_kobo)
  values ('subscription_activation', v_customer, v_selection, v_plan.monthly_price_kobo);

  return v_selection;
end $$;

create or replace function public.fn_cancel_pending_selection(p_selection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pending_plan_selections
     set status = 'cancelled'
   where id = p_selection_id
     and customer_id = public.current_customer_id()
     and status = 'pending_payment';
  if not found then
    raise exception 'no live selection to cancel';
  end if;
  update public.pending_payment_intents set status = 'cancelled'
   where pending_selection_id = p_selection_id and status = 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- Manual subscription activation (admin) for test / migrated customers.
-- ---------------------------------------------------------------------------
create or replace function public.fn_activate_manual_subscription(
  p_customer_id uuid,
  p_plan_id uuid,
  p_child_id uuid default null,
  p_starts_on date default null,
  p_reason text default 'manual activation'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan public.subscription_plans;
  v_sub uuid;
  v_cycle uuid;
  v_start date := coalesce(p_starts_on, (now() at time zone 'Africa/Lagos')::date);
  i integer;
begin
  if not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found or v_plan.status = 'archived' then
    raise exception 'plan not available';
  end if;

  if p_child_id is not null and not exists (
      select 1 from public.children c
      where c.id = p_child_id and c.customer_id = p_customer_id) then
    raise exception 'child does not belong to customer';
  end if;

  if exists (select 1 from public.subscriptions s
             where s.customer_id = p_customer_id
               and coalesce(s.child_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid)
               and s.status in ('active','expiring_soon','renewal_due')) then
    raise exception 'recipient already has an active subscription';
  end if;

  insert into public.subscriptions
    (customer_id, child_id, plan_id, plan_version_id, status, created_by, activation_source)
  values
    (p_customer_id, p_child_id, p_plan_id, public.latest_plan_version(p_plan_id),
     'active', auth.uid(), 'manual')
  returning id into v_sub;

  insert into public.subscription_cycles
    (subscription_id, cycle_number, starts_on, ends_on, visits_included, status)
  values (v_sub, 1, v_start, v_start + interval '1 month', v_plan.visits_included, 'active')
  returning id into v_cycle;

  for i in 1..v_plan.visits_included loop
    insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, i);
  end loop;

  -- Resolve any live pending selection for the same recipient.
  update public.pending_plan_selections
     set status = 'activated'
   where customer_id = p_customer_id
     and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and status = 'pending_payment';

  perform public.write_audit('subscription.manual_activate', 'subscription', v_sub,
    p_reason, jsonb_build_object('plan_id', p_plan_id, 'customer_id', p_customer_id));

  return v_sub;
end $$;

-- ---------------------------------------------------------------------------
-- Booking. Reserves a visit; never consumes it.
-- ---------------------------------------------------------------------------
create or replace function public.fn_book_appointment(
  p_subscription_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_location_type text default 'salon',
  p_child_id uuid default null,
  p_extra_service_ids uuid[] default '{}',
  p_customer_notes text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_cycle public.subscription_cycles;
  v_service public.services;
  v_settings public.scheduling_settings;
  v_hours public.business_hours;
  v_cp public.customer_profiles;
  v_entitlement uuid;
  v_appt uuid;
  v_extra public.extra_services;
  v_extra_id uuid;
  v_duration integer;
  v_addon_total bigint := 0;
  v_needs_prepay boolean := false;
  v_ends_at timestamptz;
  v_date date := public.lagos_date(p_starts_at);
  v_time time := public.lagos_time(p_starts_at);
  v_dow integer := extract(dow from public.lagos_date(p_starts_at))::integer;
  v_status text;
  v_home_addr jsonb := null;
  v_capacity integer;
begin
  -- Actor: the customer themselves, or staff with appointments.create.
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription not found';
  end if;
  v_customer := v_sub.customer_id;

  if v_customer is distinct from public.current_customer_id()
     and not public.has_permission('appointments.create') then
    raise exception 'not allowed to book for this subscription';
  end if;

  if not public.is_profile_booking_ready(v_customer) then
    raise exception 'PROFILE_INCOMPLETE: complete your profile before booking';
  end if;

  if v_sub.status not in ('active', 'expiring_soon', 'renewal_due') then
    raise exception 'SUBSCRIPTION_INACTIVE: subscription is not active';
  end if;

  -- Recipient must match the subscription beneficiary.
  if coalesce(v_sub.child_id, '00000000-0000-0000-0000-000000000000'::uuid)
     <> coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'RECIPIENT_MISMATCH: this subscription is not for the selected person';
  end if;

  if p_child_id is not null and not exists (
      select 1 from public.children c
      where c.id = p_child_id and c.customer_id = v_customer and c.is_active) then
    raise exception 'RECIPIENT_MISMATCH: child not found or archived';
  end if;

  select * into v_plan from public.subscription_plans where id = v_sub.plan_id;
  select * into v_settings from public.scheduling_settings limit 1;
  select * into v_service from public.services where id = p_service_id;
  if not found or not v_service.is_active then
    raise exception 'SERVICE_UNAVAILABLE: service not available';
  end if;

  -- Location checks.
  if p_location_type not in ('salon', 'home') then
    raise exception 'invalid location type';
  end if;
  if p_location_type = 'home' then
    if v_plan.location_type = 'salon' then
      raise exception 'LOCATION_INELIGIBLE: plan does not include home service';
    end if;
    if not v_service.home_available then
      raise exception 'LOCATION_INELIGIBLE: service not available at home';
    end if;
    select * into v_cp from public.customer_profiles where id = v_customer;
    if not (v_cp.service_area = any (v_settings.supported_service_areas)) then
      raise exception 'SERVICE_AREA: home service is only available within %',
        array_to_string(v_settings.supported_service_areas, ', ');
    end if;
    v_home_addr := jsonb_build_object(
      'address', v_cp.address, 'city', v_cp.city,
      'state', v_cp.state, 'area', v_cp.service_area);
  else
    if v_plan.location_type = 'home' then
      raise exception 'LOCATION_INELIGIBLE: plan is home-service only';
    end if;
    if not v_service.salon_available then
      raise exception 'LOCATION_INELIGIBLE: service not available in salon';
    end if;
  end if;

  -- Service <-> plan association: excluded/restricted services are blocked.
  if exists (select 1 from public.subscription_plan_services ps
             where ps.plan_id = v_plan.id and ps.service_id = p_service_id
               and ps.relation in ('excluded', 'restricted')) then
    raise exception 'SERVICE_UNAVAILABLE: service not included in this plan';
  end if;
  -- If the plan lists any included services, the chosen one must be listed.
  if exists (select 1 from public.subscription_plan_services ps
             where ps.plan_id = v_plan.id and ps.relation = 'included')
     and not exists (select 1 from public.subscription_plan_services ps
                     where ps.plan_id = v_plan.id and ps.service_id = p_service_id
                       and ps.relation in ('included', 'optional')) then
    raise exception 'SERVICE_UNAVAILABLE: service not included in this plan';
  end if;

  -- Age group.
  if p_child_id is not null and v_service.eligible_age_group = 'adults' then
    raise exception 'SERVICE_UNAVAILABLE: service is for adults only';
  end if;
  if p_child_id is null and v_service.eligible_age_group = 'children' then
    raise exception 'SERVICE_UNAVAILABLE: service is for children only';
  end if;

  -- Plan available days.
  if not (v_dow = any (v_plan.available_days)) then
    raise exception 'DAY_UNAVAILABLE: plan does not allow bookings on this day';
  end if;

  -- Advance notice and booking window.
  if p_starts_at < now() + make_interval(hours => v_settings.min_booking_notice_hours) then
    raise exception 'NOTICE: bookings need at least % hours notice',
      v_settings.min_booking_notice_hours;
  end if;
  if v_date > (now() at time zone 'Africa/Lagos')::date + v_settings.max_advance_booking_days then
    raise exception 'WINDOW: bookings can be made at most % days ahead',
      v_settings.max_advance_booking_days;
  end if;

  -- Business hours + blackout dates.
  select * into v_hours from public.business_hours where day_of_week = v_dow;
  if not found or not v_hours.is_open then
    raise exception 'CLOSED: the salon is closed on this day';
  end if;

  -- Duration: included service + selected add-ons (snapshot prices too).
  v_duration := v_service.estimated_duration_minutes;
  foreach v_extra_id in array coalesce(p_extra_service_ids, '{}') loop
    select * into v_extra from public.extra_services where id = v_extra_id;
    if not found then
      raise exception 'ADDON_INELIGIBLE: extra service not found';
    end if;
    if not public.is_extra_service_eligible(
        v_extra_id, v_plan.id, v_plan.category_id, p_location_type) then
      raise exception 'ADDON_INELIGIBLE: % is not available for this booking', v_extra.name;
    end if;
    if p_starts_at < now() + make_interval(hours => v_extra.min_advance_notice_hours) then
      raise exception 'ADDON_NOTICE: % needs at least % hours notice',
        v_extra.name, v_extra.min_advance_notice_hours;
    end if;
    v_duration := v_duration + v_extra.estimated_duration_minutes;
    v_addon_total := v_addon_total + v_extra.price_kobo;
    if v_extra.payment_requirement = 'pay_before_confirmation' then
      v_needs_prepay := true;
    end if;
  end loop;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  if v_time < v_hours.open_time
     or public.lagos_time(v_ends_at) > v_hours.close_time then
    raise exception 'HOURS: appointment must fit within opening hours (% - %)',
      v_hours.open_time, v_hours.close_time;
  end if;

  if exists (select 1 from public.blackout_dates b
             where b.date = v_date
               and (b.is_full_day
                    or (v_time < b.end_time and public.lagos_time(v_ends_at) > b.start_time))) then
    raise exception 'BLACKOUT: the salon is unavailable on this date';
  end if;

  -- Active cycle covering the appointment date.
  select * into v_cycle from public.subscription_cycles c
  where c.subscription_id = v_sub.id and c.status = 'active'
    and v_date >= c.starts_on and v_date < c.ends_on
  order by c.cycle_number desc limit 1;
  if not found then
    raise exception 'CYCLE: the date falls outside your current subscription cycle';
  end if;

  -- Interval rule: minimum full days between subscription visits.
  if exists (
      select 1 from public.appointments a
      where a.subscription_id = v_sub.id
        and a.status = any (public.live_appointment_statuses())
        and abs(public.lagos_date(a.starts_at) - v_date) < v_plan.min_visit_interval_days
  ) then
    raise exception 'INTERVAL: subscription visits must be at least % days apart',
      v_plan.min_visit_interval_days;
  end if;

  -- Serialize capacity checks per date+location to prevent double-booking races.
  perform pg_advisory_xact_lock(hashtext('booking:' || v_date::text || ':' || p_location_type));

  if p_location_type = 'home' then
    select count(*) into v_capacity from public.appointments a
    where a.location_type = 'home'
      and public.lagos_date(a.starts_at) = v_date
      and a.status = any (public.live_appointment_statuses());
    if v_capacity >= v_settings.home_service_capacity_per_day then
      raise exception 'CAPACITY: no home-service capacity left on this date';
    end if;
  else
    select count(*) into v_capacity from public.appointments a
    where a.location_type = 'salon'
      and a.starts_at < v_ends_at and a.ends_at > p_starts_at
      and a.status = any (public.live_appointment_statuses());
    if v_capacity >= v_settings.max_bookings_per_slot then
      raise exception 'CAPACITY: this time is fully booked';
    end if;
  end if;

  -- Duplicate protection: one live appointment per subscription per day.
  if exists (select 1 from public.appointments a
             where a.subscription_id = v_sub.id
               and public.lagos_date(a.starts_at) = v_date
               and a.status = any (public.live_appointment_statuses())) then
    raise exception 'DUPLICATE: you already have a booking on this date';
  end if;

  -- Reserve the earliest available entitlement (row-locked).
  select e.id into v_entitlement
  from public.visit_entitlements e
  where e.cycle_id = v_cycle.id and e.status = 'available'
  order by e.seq_number
  for update skip locked
  limit 1;
  if v_entitlement is null then
    raise exception 'NO_VISITS: no visits remaining in this cycle';
  end if;

  v_status := case when v_needs_prepay then 'pending_addon_payment'
                   else 'pending_confirmation' end;

  insert into public.appointments
    (customer_id, child_id, subscription_id, cycle_id, service_id, location_type,
     home_address, starts_at, ends_at, duration_minutes, status, customer_notes,
     addon_total_kobo)
  values
    (v_customer, p_child_id, v_sub.id, v_cycle.id, p_service_id, p_location_type,
     v_home_addr, p_starts_at, v_ends_at, v_duration, v_status,
     coalesce(p_customer_notes, ''), v_addon_total)
  returning id into v_appt;

  update public.visit_entitlements set status = 'reserved' where id = v_entitlement;
  insert into public.visit_reservations (entitlement_id, appointment_id)
  values (v_entitlement, v_appt);

  foreach v_extra_id in array coalesce(p_extra_service_ids, '{}') loop
    select * into v_extra from public.extra_services where id = v_extra_id;
    insert into public.appointment_extra_services
      (appointment_id, extra_service_id, price_kobo, duration_minutes, payment_requirement)
    values (v_appt, v_extra_id, v_extra.price_kobo,
            v_extra.estimated_duration_minutes, v_extra.payment_requirement);
  end loop;

  if v_needs_prepay then
    insert into public.pending_payment_intents
      (purpose, customer_id, appointment_id, amount_kobo)
    values ('addon_payment', v_customer, v_appt, v_addon_total);
  end if;

  return v_appt;
end $$;

-- ---------------------------------------------------------------------------
-- Rescheduling: preserves the reservation, keeps full history.
-- ---------------------------------------------------------------------------
create or replace function public.fn_reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamptz,
  p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_plan public.subscription_plans;
  v_cycle public.subscription_cycles;
  v_settings public.scheduling_settings;
  v_hours public.business_hours;
  v_is_staff boolean := public.has_permission('appointments.update');
  v_new_date date := public.lagos_date(p_new_starts_at);
  v_new_time time := public.lagos_time(p_new_starts_at);
  v_dow integer := extract(dow from public.lagos_date(p_new_starts_at))::integer;
  v_new_ends timestamptz;
  v_capacity integer;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment not found';
  end if;

  if v_appt.customer_id is distinct from public.current_customer_id()
     and not v_is_staff then
    raise exception 'not allowed';
  end if;

  if v_appt.status not in ('pending_confirmation', 'confirmed', 'assigned',
                           'pending_addon_payment') then
    raise exception 'STATE: this appointment can no longer be rescheduled';
  end if;

  select * into v_settings from public.scheduling_settings limit 1;

  -- Customers must respect the rescheduling deadline; staff may override.
  if not v_is_staff
     and v_appt.starts_at < now() + make_interval(hours => v_settings.reschedule_deadline_hours) then
    raise exception 'DEADLINE: rescheduling closes % hours before the appointment',
      v_settings.reschedule_deadline_hours;
  end if;
  if p_new_starts_at < now() + make_interval(hours => v_settings.min_booking_notice_hours) then
    raise exception 'NOTICE: the new time needs at least % hours notice',
      v_settings.min_booking_notice_hours;
  end if;

  v_new_ends := p_new_starts_at + make_interval(mins => v_appt.duration_minutes);

  select * into v_hours from public.business_hours where day_of_week = v_dow;
  if not found or not v_hours.is_open then
    raise exception 'CLOSED: the salon is closed on this day';
  end if;
  if v_new_time < v_hours.open_time or public.lagos_time(v_new_ends) > v_hours.close_time then
    raise exception 'HOURS: appointment must fit within opening hours';
  end if;
  if exists (select 1 from public.blackout_dates b
             where b.date = v_new_date
               and (b.is_full_day
                    or (v_new_time < b.end_time and public.lagos_time(v_new_ends) > b.start_time))) then
    raise exception 'BLACKOUT: the salon is unavailable on this date';
  end if;

  if v_appt.subscription_id is not null then
    select * into v_plan from public.subscription_plans
      where id = (select plan_id from public.subscriptions where id = v_appt.subscription_id);

    -- New date must remain inside the SAME cycle (no rebooking past expiry).
    select * into v_cycle from public.subscription_cycles where id = v_appt.cycle_id;
    if v_new_date < v_cycle.starts_on or v_new_date >= v_cycle.ends_on then
      raise exception 'CYCLE: the new date falls outside your subscription cycle';
    end if;

    -- Interval rule, excluding this appointment itself.
    if exists (
        select 1 from public.appointments a
        where a.subscription_id = v_appt.subscription_id
          and a.id <> v_appt.id
          and a.status = any (public.live_appointment_statuses())
          and abs(public.lagos_date(a.starts_at) - v_new_date) < v_plan.min_visit_interval_days
    ) then
      raise exception 'INTERVAL: subscription visits must be at least % days apart',
        v_plan.min_visit_interval_days;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('booking:' || v_new_date::text || ':' || v_appt.location_type));

  if v_appt.location_type = 'home' then
    select count(*) into v_capacity from public.appointments a
    where a.location_type = 'home' and a.id <> v_appt.id
      and public.lagos_date(a.starts_at) = v_new_date
      and a.status = any (public.live_appointment_statuses());
    if v_capacity >= v_settings.home_service_capacity_per_day then
      raise exception 'CAPACITY: no home-service capacity left on this date';
    end if;
  else
    select count(*) into v_capacity from public.appointments a
    where a.location_type = 'salon' and a.id <> v_appt.id
      and a.starts_at < v_new_ends and a.ends_at > p_new_starts_at
      and a.status = any (public.live_appointment_statuses());
    if v_capacity >= v_settings.max_bookings_per_slot then
      raise exception 'CAPACITY: this time is fully booked';
    end if;
  end if;

  insert into public.appointment_reschedule_history
    (appointment_id, old_starts_at, old_ends_at, new_starts_at, new_ends_at,
     actor_profile_id, reason)
  values (v_appt.id, v_appt.starts_at, v_appt.ends_at, p_new_starts_at, v_new_ends,
          auth.uid(), nullif(p_reason, ''));

  update public.appointments
     set starts_at = p_new_starts_at,
         ends_at = v_new_ends,
         -- customer reschedules go back to pending confirmation; staff keep status
         status = case when v_is_staff then status else 'pending_confirmation' end,
         stylist_profile_id = case when v_is_staff then stylist_profile_id else null end
   where id = v_appt.id;
end $$;

-- ---------------------------------------------------------------------------
-- Completion: consumes the reserved visit exactly once.
-- ---------------------------------------------------------------------------
create or replace function public.fn_complete_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_res public.visit_reservations;
begin
  if not public.has_permission('appointments.complete') then
    raise exception 'permission denied: appointments.complete';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment not found';
  end if;
  if v_appt.status = 'completed' then
    raise exception 'ALREADY_COMPLETED: appointment is already completed';
  end if;
  if v_appt.status not in ('confirmed', 'assigned', 'arrived', 'in_service') then
    raise exception 'STATE: appointment cannot be completed from status %', v_appt.status;
  end if;

  update public.appointments
     set status = 'completed', completed_at = now()
   where id = p_appointment_id;

  select * into v_res from public.visit_reservations
   where appointment_id = p_appointment_id and status = 'active'
   for update;
  if found then
    update public.visit_reservations
       set status = 'converted', released_at = now()
     where id = v_res.id;
    update public.visit_entitlements
       set status = 'consumed', consumed_at = now()
     where id = v_res.entitlement_id
       and status = 'reserved'; -- double-consumption guard
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Release paths: missed / salon cancel / admin cancel / expiry.
-- The reservation is released and the visit returns to the customer.
-- ---------------------------------------------------------------------------
create or replace function public.fn_release_appointment(
  p_appointment_id uuid,
  p_new_status text,
  p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_res public.visit_reservations;
  v_cycle public.subscription_cycles;
begin
  if p_new_status not in ('missed', 'cancelled_salon', 'cancelled_admin',
                          'no_longer_eligible', 'expired') then
    raise exception 'invalid release status';
  end if;
  if not public.has_permission('appointments.cancel')
     and not public.has_permission('appointments.update') then
    raise exception 'permission denied';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment not found';
  end if;
  if v_appt.status = 'completed' then
    raise exception 'STATE: completed appointments cannot be released';
  end if;

  update public.appointments set status = p_new_status where id = p_appointment_id;

  insert into public.appointment_status_history
    (appointment_id, previous_status, new_status, actor_profile_id, reason)
  values (p_appointment_id, v_appt.status, p_new_status, auth.uid(), nullif(p_reason, ''))
  on conflict do nothing;

  select * into v_res from public.visit_reservations
   where appointment_id = p_appointment_id and status = 'active' for update;
  if found then
    update public.visit_reservations
       set status = 'released', released_at = now(), release_reason = p_new_status
     where id = v_res.id;

    select c.* into v_cycle
    from public.visit_entitlements e
    join public.subscription_cycles c on c.id = e.cycle_id
    where e.id = v_res.entitlement_id;

    -- Visit returns to the customer while the cycle is still running;
    -- otherwise it expires with the cycle.
    update public.visit_entitlements
       set status = case
         when v_cycle.status = 'active'
              and v_cycle.ends_on > (now() at time zone 'Africa/Lagos')::date
           then 'available' else 'expired' end
     where id = v_res.entitlement_id and status = 'reserved';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stylist assignment (staff/admin only — customers can never call this).
-- ---------------------------------------------------------------------------
create or replace function public.fn_assign_stylist(
  p_appointment_id uuid,
  p_stylist_profile_id uuid,
  p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_skill text;
begin
  if not public.has_permission('appointments.assign') then
    raise exception 'permission denied: appointments.assign';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment not found';
  end if;
  if v_appt.status not in ('pending_confirmation', 'confirmed', 'assigned') then
    raise exception 'STATE: cannot assign a stylist in status %', v_appt.status;
  end if;

  if not exists (select 1 from public.profiles p
                 where p.id = p_stylist_profile_id
                   and p.role in ('staff', 'admin') and p.is_active) then
    raise exception 'stylist must be an active staff member';
  end if;

  -- Skill requirement from the included service (add-on skills advisory only).
  select s.required_skill into v_skill
  from public.services s where s.id = v_appt.service_id;
  if v_skill is not null and not exists (
      select 1 from public.stylist_skills sk
      where sk.staff_profile_id = p_stylist_profile_id and sk.skill = v_skill) then
    raise exception 'SKILL: stylist lacks required skill %', v_skill;
  end if;

  insert into public.stylist_assignment_history
    (appointment_id, previous_stylist_id, new_stylist_id, actor_profile_id, reason)
  values (p_appointment_id, v_appt.stylist_profile_id, p_stylist_profile_id,
          auth.uid(), nullif(p_reason, ''));

  -- The exclusion constraint blocks overlapping assignments atomically.
  update public.appointments
     set stylist_profile_id = p_stylist_profile_id,
         status = case when status in ('pending_confirmation','confirmed')
                       then 'assigned' else status end
   where id = p_appointment_id;
end $$;

-- ---------------------------------------------------------------------------
-- Simple staff status transitions (confirm / arrived / in service).
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_appointment_status(
  p_appointment_id uuid,
  p_new_status text,
  p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_allowed boolean;
begin
  if not public.has_permission('appointments.update') then
    raise exception 'permission denied: appointments.update';
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment not found'; end if;

  v_allowed := case p_new_status
    when 'confirmed' then v_appt.status in ('pending_confirmation', 'pending_addon_payment')
    when 'arrived' then v_appt.status in ('confirmed', 'assigned')
    when 'in_service' then v_appt.status in ('arrived', 'assigned', 'confirmed')
    else false
  end;
  if not v_allowed then
    raise exception 'STATE: cannot move from % to %', v_appt.status, p_new_status;
  end if;

  update public.appointments set status = p_new_status where id = p_appointment_id;
  if p_reason <> '' then
    update public.appointment_status_history
       set reason = p_reason
     where appointment_id = p_appointment_id
       and id = (select id from public.appointment_status_history
                 where appointment_id = p_appointment_id
                 order by created_at desc limit 1);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Visit balance adjustment (admin, reason REQUIRED, audited).
-- ---------------------------------------------------------------------------
create or replace function public.fn_adjust_visit_balance(
  p_cycle_id uuid,
  p_delta integer,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.subscription_cycles;
  v_max integer;
  i integer;
  v_ent uuid;
begin
  if not public.has_permission('subscriptions.adjust_visits') then
    raise exception 'permission denied: subscriptions.adjust_visits';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: a reason is required for visit adjustments';
  end if;
  if p_delta = 0 or abs(p_delta) > 10 then
    raise exception 'delta must be between -10 and 10 and not zero';
  end if;

  select * into v_cycle from public.subscription_cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle not found'; end if;

  if p_delta > 0 then
    select coalesce(max(seq_number), 0) into v_max
    from public.visit_entitlements where cycle_id = p_cycle_id;
    for i in 1..p_delta loop
      insert into public.visit_entitlements (cycle_id, seq_number)
      values (p_cycle_id, v_max + i);
    end loop;
  else
    for i in 1..abs(p_delta) loop
      select id into v_ent from public.visit_entitlements
      where cycle_id = p_cycle_id and status = 'available'
      order by seq_number desc limit 1 for update;
      if v_ent is null then
        raise exception 'NO_VISITS: not enough available visits to remove';
      end if;
      update public.visit_entitlements set status = 'revoked' where id = v_ent;
    end loop;
  end if;

  perform public.write_audit('subscription.adjust_visits', 'subscription_cycle',
    p_cycle_id, p_reason, jsonb_build_object('delta', p_delta));
end $$;

-- ---------------------------------------------------------------------------
-- Cycle expiry sweep (callable by cron / admin). Expires ended cycles,
-- their unused entitlements, and subscriptions with no future cycle.
-- ---------------------------------------------------------------------------
create or replace function public.fn_expire_cycles()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select c.id, c.subscription_id from public.subscription_cycles c
    where c.status = 'active'
      and c.ends_on <= (now() at time zone 'Africa/Lagos')::date
    for update
  loop
    update public.subscription_cycles set status = 'expired' where id = r.id;
    update public.visit_entitlements set status = 'expired'
      where cycle_id = r.id and status in ('available', 'reserved');
    update public.visit_reservations vr set status = 'released',
        released_at = now(), release_reason = 'cycle_expired'
      from public.visit_entitlements e
      where vr.entitlement_id = e.id and e.cycle_id = r.id and vr.status = 'active';
    update public.subscriptions s set status = 'expired'
      where s.id = r.subscription_id
        and s.status in ('active', 'expiring_soon', 'renewal_due')
        and not exists (select 1 from public.subscription_cycles c2
                        where c2.subscription_id = s.id and c2.status in ('active', 'upcoming'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Opt out of next renewal (customer). Active paid cycle is never cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_renewal_opt_out(
  p_subscription_id uuid, p_opt_out boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions
     set opt_out_next_renewal = p_opt_out
   where id = p_subscription_id
     and customer_id = public.current_customer_id()
     and status in ('active', 'expiring_soon', 'renewal_due');
  if not found then
    raise exception 'subscription not found or not active';
  end if;
end $$;
