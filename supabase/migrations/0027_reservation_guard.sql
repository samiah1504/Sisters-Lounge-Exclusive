-- ============================================================================
-- 0027 — FORWARD-LOOKING RESERVATION GUARD (v3 §5.6, Session C3)
-- Reserving late in a cycle can strand the member's remaining visits
-- (the interval rule leaves no room for them). The reservation still
-- succeeds — the appointment is flagged entitlement_at_risk for the
-- member-facing warning and the admin unused-visits report.
-- ============================================================================

alter table public.appointments
  add column entitlement_at_risk boolean not null default false;

create or replace function public.fn_book_appointment(
  p_subscription_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_salon_id uuid,
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
  v_brand public.scheduling_settings;
  v_salon public.salons;
  v_ss public.salon_settings;
  v_hours public.salon_hours;
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
  v_capacity integer;
  v_notice integer;
  v_advance integer;
  v_remaining_after integer;
  v_fittable integer;
  v_at_risk boolean := false;
begin
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
    raise exception 'PROFILE_INCOMPLETE: complete your profile before reserving';
  end if;

  if v_sub.status not in ('active', 'expiring_soon', 'renewal_due') then
    raise exception 'SUBSCRIPTION_INACTIVE: membership is not active';
  end if;

  -- Salon must exist and be open (v3 §5.11: "studio is open" replaces
  -- location eligibility).
  select * into v_salon from public.salons where id = p_salon_id;
  if not found then
    raise exception 'salon not found';
  end if;
  if v_salon.status <> 'open' then
    raise exception 'SALON_UNAVAILABLE: this salon is not currently open';
  end if;

  -- Recipient must match the membership beneficiary.
  if coalesce(v_sub.child_id, '00000000-0000-0000-0000-000000000000'::uuid)
     <> coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'RECIPIENT_MISMATCH: this membership is not for the selected person';
  end if;

  if p_child_id is not null and not exists (
      select 1 from public.children c
      where c.id = p_child_id and c.customer_id = v_customer and c.is_active) then
    raise exception 'RECIPIENT_MISMATCH: child not found or archived';
  end if;

  select * into v_plan from public.subscription_plans where id = v_sub.plan_id;
  select * into v_brand from public.scheduling_settings limit 1;
  select * into v_ss from public.salon_settings where salon_id = p_salon_id;
  v_notice := coalesce(v_ss.min_booking_notice_hours, v_brand.min_booking_notice_hours);
  v_advance := coalesce(v_ss.max_advance_booking_days, v_brand.max_advance_booking_days);

  select * into v_service from public.services where id = p_service_id;
  if not found or not v_service.is_active then
    raise exception 'SERVICE_UNAVAILABLE: service not available';
  end if;

  -- Service <-> plan association: excluded/restricted services are blocked.
  if exists (select 1 from public.subscription_plan_services ps
             where ps.plan_id = v_plan.id and ps.service_id = p_service_id
               and ps.relation in ('excluded', 'restricted')) then
    raise exception 'SERVICE_UNAVAILABLE: service not included in this plan';
  end if;
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
    raise exception 'DAY_UNAVAILABLE: plan does not allow visits on this day';
  end if;

  -- Advance notice and reservation window (brand default, salon override §4.7).
  if p_starts_at < now() + make_interval(hours => v_notice) then
    raise exception 'NOTICE: reservations need at least % hours notice', v_notice;
  end if;
  if v_date > (now() at time zone 'Africa/Lagos')::date + v_advance then
    raise exception 'WINDOW: reservations can be made at most % days ahead', v_advance;
  end if;

  -- Salon hours + blackout dates.
  select * into v_hours from public.salon_hours
  where salon_id = p_salon_id and day_of_week = v_dow;
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
    if not public.is_extra_service_eligible(v_extra_id, v_plan.id, v_plan.category_id) then
      raise exception 'ADDON_INELIGIBLE: % is not available for this reservation', v_extra.name;
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
    raise exception 'HOURS: visit must fit within salon hours (% - %)',
      v_hours.open_time, v_hours.close_time;
  end if;

  if exists (select 1 from public.salon_blackout_dates b
             where b.salon_id = p_salon_id and b.date = v_date
               and (b.is_full_day
                    or (v_time < b.end_time and public.lagos_time(v_ends_at) > b.start_time))) then
    raise exception 'BLACKOUT: the salon is unavailable on this date';
  end if;

  -- Active cycle covering the visit date.
  select * into v_cycle from public.subscription_cycles c
  where c.subscription_id = v_sub.id and c.status = 'active'
    and v_date >= c.starts_on and v_date < c.ends_on
  order by c.cycle_number desc limit 1;
  if not found then
    raise exception 'CYCLE: the date falls outside your current membership cycle';
  end if;

  -- Interval rule (v3 §5.5, edge case #40): minimum days between visits,
  -- REGARDLESS of which salon serves them.
  if exists (
      select 1 from public.appointments a
      where a.subscription_id = v_sub.id
        and a.status = any (public.live_appointment_statuses())
        and abs(public.lagos_date(a.starts_at) - v_date) < v_plan.min_visit_interval_days
  ) then
    raise exception 'INTERVAL: visits must be at least % days apart',
      v_plan.min_visit_interval_days;
  end if;

  -- Serialize capacity checks per date+salon (availability isolation:
  -- a full calendar at salon A must not affect salon B — v3 §13).
  perform pg_advisory_xact_lock(hashtext('booking:' || v_date::text || ':' || p_salon_id::text));

  select count(*) into v_capacity from public.appointments a
  where a.salon_id = p_salon_id
    and a.starts_at < v_ends_at and a.ends_at > p_starts_at
    and a.status = any (public.live_appointment_statuses());
  if v_capacity >= least(v_ss.max_bookings_per_slot, v_salon.chair_capacity) then
    raise exception 'CAPACITY: this time is fully booked at this salon';
  end if;

  -- One visit per day per member profile ACROSS salons (v3 edge case #37).
  if exists (select 1 from public.appointments a
             where a.customer_id = v_customer
               and coalesce(a.child_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid)
               and public.lagos_date(a.starts_at) = v_date
               and a.status = any (public.live_appointment_statuses())) then
    raise exception 'DUPLICATE: there is already a visit reserved on this date';
  end if;

  -- Reserve the earliest available entitlement (row-locked, v3 §5.2).
  select e.id into v_entitlement
  from public.visit_entitlements e
  where e.cycle_id = v_cycle.id and e.status = 'available'
  order by e.seq_number
  for update skip locked
  limit 1;
  if v_entitlement is null then
    raise exception 'NO_VISITS: no visits remaining in this cycle';
  end if;

  -- Forward-looking guard (v3 §5.6): after this reservation, do the
  -- remaining visits still fit inside the cycle given the interval?
  -- NON-BLOCKING — the flag feeds the member warning and the admin
  -- unused-visits report; it never prevents the reservation.
  select count(*) - 1 into v_remaining_after
  from public.visit_entitlements
  where cycle_id = v_cycle.id and status = 'available';
  if v_remaining_after > 0 and v_plan.min_visit_interval_days > 0 then
    v_fittable := greatest(0, (v_cycle.ends_on - 1) - v_date)
                  / v_plan.min_visit_interval_days;
    v_at_risk := v_remaining_after > v_fittable;
  end if;

  v_status := case when v_needs_prepay then 'pending_addon_payment'
                   else 'pending_confirmation' end;

  insert into public.appointments
    (customer_id, child_id, subscription_id, cycle_id, service_id, salon_id,
     starts_at, ends_at, duration_minutes, status, customer_notes,
     addon_total_kobo, entitlement_at_risk)
  values
    (v_customer, p_child_id, v_sub.id, v_cycle.id, p_service_id, p_salon_id,
     p_starts_at, v_ends_at, v_duration, v_status,
     coalesce(p_customer_notes, ''), v_addon_total, v_at_risk)
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
