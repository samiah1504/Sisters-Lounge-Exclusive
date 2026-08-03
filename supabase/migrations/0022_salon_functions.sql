-- ============================================================================
-- 0022 — SALON-AWARE BUSINESS FUNCTIONS (v3 §5.11, §12 #34–40, §4.5)
-- Rewrites reservation, availability, rescheduling, inventory and capacity
-- functions against the multi-salon model. Every v3 rule cited inline.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reserve Visit (v3 §6.2). Salon is explicit; visits are portable (§4.4) —
-- any active member may reserve at any OPEN salon.
-- ---------------------------------------------------------------------------
drop function public.fn_book_appointment(uuid, uuid, timestamptz, text, uuid, uuid[], text);

create function public.fn_book_appointment(
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

  v_status := case when v_needs_prepay then 'pending_addon_payment'
                   else 'pending_confirmation' end;

  insert into public.appointments
    (customer_id, child_id, subscription_id, cycle_id, service_id, salon_id,
     starts_at, ends_at, duration_minutes, status, customer_notes,
     addon_total_kobo)
  values
    (v_customer, p_child_id, v_sub.id, v_cycle.id, p_service_id, p_salon_id,
     p_starts_at, v_ends_at, v_duration, v_status,
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
-- Rescheduling (v3 §5.8): reschedule-only, same salon, reservation kept.
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
  v_brand public.scheduling_settings;
  v_salon public.salons;
  v_ss public.salon_settings;
  v_hours public.salon_hours;
  v_is_staff boolean := public.has_permission('appointments.update');
  v_new_date date := public.lagos_date(p_new_starts_at);
  v_new_time time := public.lagos_time(p_new_starts_at);
  v_dow integer := extract(dow from public.lagos_date(p_new_starts_at))::integer;
  v_new_ends timestamptz;
  v_capacity integer;
  v_notice integer;
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
    raise exception 'STATE: this visit can no longer be rescheduled';
  end if;

  select * into v_salon from public.salons where id = v_appt.salon_id;
  if v_salon.status <> 'open' then
    raise exception 'SALON_UNAVAILABLE: this salon is not currently open';
  end if;

  select * into v_brand from public.scheduling_settings limit 1;
  select * into v_ss from public.salon_settings where salon_id = v_appt.salon_id;
  v_notice := coalesce(v_ss.min_booking_notice_hours, v_brand.min_booking_notice_hours);

  -- Members must respect the rescheduling deadline; staff may override.
  if not v_is_staff
     and v_appt.starts_at < now() + make_interval(hours => v_brand.reschedule_deadline_hours) then
    raise exception 'DEADLINE: rescheduling closes % hours before the visit',
      v_brand.reschedule_deadline_hours;
  end if;
  if p_new_starts_at < now() + make_interval(hours => v_notice) then
    raise exception 'NOTICE: the new time needs at least % hours notice', v_notice;
  end if;

  v_new_ends := p_new_starts_at + make_interval(mins => v_appt.duration_minutes);

  select * into v_hours from public.salon_hours
  where salon_id = v_appt.salon_id and day_of_week = v_dow;
  if not found or not v_hours.is_open then
    raise exception 'CLOSED: the salon is closed on this day';
  end if;
  if v_new_time < v_hours.open_time or public.lagos_time(v_new_ends) > v_hours.close_time then
    raise exception 'HOURS: visit must fit within salon hours';
  end if;
  if exists (select 1 from public.salon_blackout_dates b
             where b.salon_id = v_appt.salon_id and b.date = v_new_date
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
      raise exception 'CYCLE: the new date falls outside your membership cycle';
    end if;

    -- Interval rule across salons (v3 #40), excluding this visit itself.
    if exists (
        select 1 from public.appointments a
        where a.subscription_id = v_appt.subscription_id
          and a.id <> v_appt.id
          and a.status = any (public.live_appointment_statuses())
          and abs(public.lagos_date(a.starts_at) - v_new_date) < v_plan.min_visit_interval_days
    ) then
      raise exception 'INTERVAL: visits must be at least % days apart',
        v_plan.min_visit_interval_days;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('booking:' || v_new_date::text || ':' || v_appt.salon_id::text));

  select count(*) into v_capacity from public.appointments a
  where a.salon_id = v_appt.salon_id and a.id <> v_appt.id
    and a.starts_at < v_new_ends and a.ends_at > p_new_starts_at
    and a.status = any (public.live_appointment_statuses());
  if v_capacity >= least(v_ss.max_bookings_per_slot, v_salon.chair_capacity) then
    raise exception 'CAPACITY: this time is fully booked at this salon';
  end if;

  insert into public.appointment_reschedule_history
    (appointment_id, old_starts_at, old_ends_at, new_starts_at, new_ends_at,
     actor_profile_id, reason)
  values (v_appt.id, v_appt.starts_at, v_appt.ends_at, p_new_starts_at, v_new_ends,
          auth.uid(), nullif(p_reason, ''));

  update public.appointments
     set starts_at = p_new_starts_at,
         ends_at = v_new_ends,
         status = case when v_is_staff then status else 'pending_confirmation' end,
         stylist_profile_id = case when v_is_staff then stylist_profile_id else null end
   where id = v_appt.id;
end $$;

-- ---------------------------------------------------------------------------
-- Availability per salon (v3 §5.11). Empty result unless the salon is open.
-- ---------------------------------------------------------------------------
drop function public.fn_get_available_slots(date, text, integer);

create function public.fn_get_available_slots(
  p_salon_id uuid,
  p_date date,
  p_duration_minutes integer default 60
) returns table (slot_start timestamptz, remaining_capacity integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_brand public.scheduling_settings;
  v_salon public.salons;
  v_ss public.salon_settings;
  v_hours public.salon_hours;
  v_dow integer := extract(dow from p_date)::integer;
  v_slot time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_used integer;
  v_cap integer;
  v_max integer;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_notice integer;
  v_advance integer;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if not found or v_salon.status <> 'open' then return; end if;

  select * into v_brand from public.scheduling_settings limit 1;
  select * into v_ss from public.salon_settings where salon_id = p_salon_id;
  if not found then return; end if;
  v_notice := coalesce(v_ss.min_booking_notice_hours, v_brand.min_booking_notice_hours);
  v_advance := coalesce(v_ss.max_advance_booking_days, v_brand.max_advance_booking_days);
  v_max := least(v_ss.max_bookings_per_slot, v_salon.chair_capacity);

  select * into v_hours from public.salon_hours
  where salon_id = p_salon_id and day_of_week = v_dow;
  if not found or not v_hours.is_open then return; end if;
  if p_date > v_today + v_advance then return; end if;
  if exists (select 1 from public.salon_blackout_dates b
             where b.salon_id = p_salon_id and b.date = p_date and b.is_full_day) then
    return;
  end if;

  v_slot := v_hours.open_time;
  while v_slot + make_interval(mins => p_duration_minutes) <= v_hours.close_time loop
    v_slot_start := (p_date::text || ' ' || v_slot::text)::timestamp
                    at time zone 'Africa/Lagos';
    v_slot_end := v_slot_start + make_interval(mins => p_duration_minutes);

    if v_slot_start >= now() + make_interval(hours => v_notice)
       and not exists (
         select 1 from public.salon_blackout_dates b
         where b.salon_id = p_salon_id and b.date = p_date and not b.is_full_day
           and v_slot < b.end_time
           and (v_slot + make_interval(mins => p_duration_minutes))::time > b.start_time)
    then
      select count(*) into v_used from public.appointments a
      where a.salon_id = p_salon_id
        and a.starts_at < v_slot_end and a.ends_at > v_slot_start
        and a.status = any (public.live_appointment_statuses());
      v_cap := v_max - v_used;

      if v_cap > 0 then
        slot_start := v_slot_start;
        remaining_capacity := v_cap;
        return next;
      end if;
    end if;

    v_slot := v_slot + make_interval(mins => v_ss.slot_duration_minutes);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Pause a salon with future reservations (v3 edge cases #34–35):
-- release every future live visit (salon-cancelled semantics — no member
-- penalty), return the released count. Callers notify + prompt rebooking.
-- ---------------------------------------------------------------------------
create function public.fn_pause_salon(p_salon_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_salon public.salons;
  v_released integer := 0;
  r record;
begin
  if auth.uid() is not null and not public.has_permission('salons.manage') then
    raise exception 'permission denied: salons.manage';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: pausing a salon needs a reason';
  end if;

  select * into v_salon from public.salons where id = p_salon_id for update;
  if not found then raise exception 'salon not found'; end if;
  if v_salon.status <> 'open' then
    raise exception 'STATE: only an open salon can be paused';
  end if;

  update public.salons set status = 'paused' where id = p_salon_id;

  for r in select id from public.appointments a
           where a.salon_id = p_salon_id
             and a.starts_at > now()
             and a.status = any (public.live_appointment_statuses())
  loop
    perform public.fn_release_appointment(r.id, 'cancelled_salon', p_reason);
    v_released := v_released + 1;
  end loop;

  perform public.write_audit('salon.paused', 'salon', p_salon_id, p_reason,
    jsonb_build_object('released_visits', v_released));

  return v_released;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory: stock lives per salon (v3 §4.5); the ledger stays the only
-- write path. Guard triggers move to salon_product_stock.
-- ---------------------------------------------------------------------------
drop trigger trg_inv_items_qty_guard on public.inventory_items;
drop trigger trg_sync_product_stock on public.inventory_items;

alter table public.inventory_items drop column quantity_available;
alter table public.inventory_items drop column quantity_on_hand;
alter table public.inventory_items drop column quantity_reserved;

create trigger trg_sps_qty_guard before update on public.salon_product_stock
for each row execute function public.guard_inventory_quantities();

create or replace function public.guard_sps_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.stock_internal', true), '') <> 'on'
     and (new.quantity_on_hand <> 0 or new.quantity_reserved <> 0) then
    raise exception 'STOCK_GUARD: quantities change only through stock movements';
  end if;
  return new;
end $$;

create trigger trg_sps_insert_guard before insert on public.salon_product_stock
for each row execute function public.guard_sps_insert();

drop function public.fn_post_stock_movement(uuid, text, numeric, text, text, uuid, text, jsonb, uuid);

create function public.fn_post_stock_movement(
  p_salon_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,          -- signed: positive adds, negative removes
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_approved_by uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.inventory_items;
  v_stock public.salon_product_stock;
  v_settings public.inventory_settings;
  v_before numeric(12,3);
  v_after numeric(12,3);
  v_is_reservation boolean := p_movement_type in ('reservation', 'reservation_release');
  v_movement uuid;
begin
  if not (public.has_permission('inventory.adjust')
          or public.has_permission('inventory.receive')
          or public.has_permission('consumption.post')
          or auth.uid() is null) then
    raise exception 'permission denied: inventory movement';
  end if;
  if p_quantity = 0 then
    raise exception 'quantity cannot be zero';
  end if;
  if not exists (select 1 from public.salons where id = p_salon_id) then
    raise exception 'salon not found';
  end if;

  select * into v_item from public.inventory_items where id = p_item_id;
  if not found then raise exception 'inventory item not found'; end if;
  select * into v_settings from public.inventory_settings limit 1;

  -- Ensure + row-lock this salon's stock row.
  insert into public.salon_product_stock (salon_id, item_id)
  values (p_salon_id, p_item_id)
  on conflict (salon_id, item_id) do nothing;
  select * into v_stock from public.salon_product_stock
  where salon_id = p_salon_id and item_id = p_item_id for update;

  if v_is_reservation then
    v_before := v_stock.quantity_reserved;
    v_after := v_before + (case when p_movement_type = 'reservation' then abs(p_quantity)
                                else -abs(p_quantity) end);
    if v_after < 0 then v_after := 0; end if;
  else
    v_before := v_stock.quantity_on_hand;
    v_after := v_before + p_quantity;
    if v_after < 0 and not v_settings.allow_negative_stock then
      raise exception 'NEGATIVE_STOCK: only % % of % available at this salon',
        v_before, v_item.unit, v_item.name;
    end if;
  end if;

  perform set_config('app.stock_internal', 'on', true);
  if v_is_reservation then
    update public.salon_product_stock set quantity_reserved = v_after
    where salon_id = p_salon_id and item_id = p_item_id;
  else
    update public.salon_product_stock set quantity_on_hand = v_after
    where salon_id = p_salon_id and item_id = p_item_id;
  end if;
  perform set_config('app.stock_internal', '', true);

  insert into public.inventory_movements
    (item_id, salon_id, movement_type, quantity, unit, quantity_before,
     quantity_after, cost_value_kobo, reference_type, reference_id, reason,
     notes, performed_by, approved_by, metadata)
  values
    (p_item_id, p_salon_id, p_movement_type, p_quantity, v_item.unit, v_before,
     v_after, (abs(p_quantity) * v_item.cost_price_kobo)::bigint,
     p_reference_type, p_reference_id, p_reason, coalesce(p_notes, ''),
     auth.uid(), p_approved_by, p_metadata)
  returning id into v_movement;

  return v_movement;
end $$;

-- Receipts post into their salon.
create or replace function public.fn_confirm_stock_receipt(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.stock_receipts;
  r record;
begin
  if auth.uid() is not null and not public.has_permission('inventory.receive') then
    raise exception 'permission denied: inventory.receive';
  end if;
  select * into v_receipt from public.stock_receipts where id = p_receipt_id for update;
  if not found then raise exception 'receipt not found'; end if;
  if v_receipt.status <> 'draft' then
    raise exception 'ALREADY_POSTED: receipt is % — stock was not changed again', v_receipt.status;
  end if;

  for r in select * from public.stock_receipt_items where receipt_id = p_receipt_id loop
    perform public.fn_post_stock_movement(
      v_receipt.salon_id, r.item_id, 'stock_received', r.quantity,
      'stock receipt ' || coalesce(nullif(v_receipt.invoice_number, ''), p_receipt_id::text),
      'stock_receipt', p_receipt_id);
    update public.inventory_items
       set cost_price_kobo = case when r.unit_cost_kobo > 0 then r.unit_cost_kobo
                                  else cost_price_kobo end,
           batch_number = coalesce(r.batch_number, batch_number),
           expiry_date = coalesce(r.expiry_date, expiry_date)
     where id = r.item_id;
  end loop;

  update public.stock_receipts
     set status = 'received', confirmed_at = now(), received_by = auth.uid()
   where id = p_receipt_id;

  perform public.write_audit('inventory.receipt_confirmed', 'stock_receipt', p_receipt_id);
end $$;

-- Count corrections post into their salon.
create or replace function public.fn_review_stock_count(
  p_count_id uuid, p_approve boolean, p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_count public.stock_counts;
  v_settings public.inventory_settings;
  v_total_variance_value bigint := 0;
  r record;
begin
  if auth.uid() is not null and not public.has_permission('inventory.approve_adjustment') then
    raise exception 'permission denied: inventory.approve_adjustment';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found or v_count.status <> 'submitted' then
    raise exception 'STATE: count is not awaiting review';
  end if;
  select * into v_settings from public.inventory_settings limit 1;

  select coalesce(sum(abs(sci.variance) * ii.cost_price_kobo), 0)::bigint
    into v_total_variance_value
  from public.stock_count_items sci
  join public.inventory_items ii on ii.id = sci.item_id
  where sci.count_id = p_count_id;

  if v_count.started_by = auth.uid()
     and v_total_variance_value >= v_settings.high_value_adjustment_kobo
     and not public.is_admin() then
    raise exception 'SELF_APPROVAL: high-value counts need another approver';
  end if;

  if not p_approve then
    update public.stock_counts
       set status = 'rejected', approved_by = auth.uid(),
           rejected_reason = nullif(p_reason, '')
     where id = p_count_id;
    return;
  end if;

  for r in select * from public.stock_count_items
           where count_id = p_count_id and counted_quantity <> system_quantity loop
    perform public.fn_post_stock_movement(
      v_count.salon_id, r.item_id, 'stock_count_correction', r.variance,
      coalesce(nullif(r.reason, ''), 'stock count variance'),
      'stock_count', p_count_id, '', '{}'::jsonb, auth.uid());
  end loop;

  update public.stock_counts
     set status = 'posted', approved_by = auth.uid()
   where id = p_count_id;

  perform public.write_audit('inventory.count_posted', 'stock_count', p_count_id,
    p_reason, jsonb_build_object('variance_value_kobo', v_total_variance_value));
end $$;

-- Consumption deducts from the SERVING salon's stock.
create or replace function public.fn_post_appointment_consumption(
  p_appointment_id uuid, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_usage uuid;
  v_total bigint := 0;
  v_item public.inventory_items;
  r record;
begin
  if auth.uid() is not null and not public.has_permission('consumption.post') then
    raise exception 'permission denied: consumption.post';
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment not found'; end if;
  if v_appt.status <> 'completed' then
    raise exception 'STATE: consumption is confirmed only for completed visits';
  end if;
  if exists (select 1 from public.appointment_inventory_usage
             where appointment_id = p_appointment_id) then
    raise exception 'ALREADY_POSTED: consumption was already confirmed for this visit';
  end if;

  insert into public.appointment_inventory_usage (appointment_id, posted_by)
  values (p_appointment_id, auth.uid()) returning id into v_usage;

  for r in select * from jsonb_to_recordset(p_items)
             as x(item_id uuid, planned numeric, actual numeric, reason text) loop
    if r.actual is null or r.actual < 0 then
      raise exception 'invalid quantity for item %', r.item_id;
    end if;
    select * into v_item from public.inventory_items where id = r.item_id;
    if not found then raise exception 'inventory item not found'; end if;

    if coalesce(r.planned, 0) > 0
       and abs(r.actual - r.planned) > r.planned * 0.25
       and coalesce(trim(r.reason), '') = '' then
      raise exception 'REASON_REQUIRED: % used % vs planned % — add a reason',
        v_item.name, r.actual, r.planned;
    end if;

    insert into public.appointment_inventory_usage_items
      (usage_id, item_id, planned_quantity, actual_quantity, unit,
       unit_cost_kobo, variance_reason)
    values (v_usage, r.item_id, coalesce(r.planned, 0), r.actual, v_item.unit,
            v_item.cost_price_kobo, nullif(trim(coalesce(r.reason, '')), ''));

    if r.actual > 0 then
      perform public.fn_post_stock_movement(
        v_appt.salon_id, r.item_id, 'appointment_consumption', -r.actual,
        'appointment consumption', 'appointment', p_appointment_id);
      v_total := v_total + (r.actual * v_item.cost_price_kobo)::bigint;
    end if;
  end loop;

  update public.appointment_inventory_usage
     set total_cost_kobo = v_total where id = v_usage;
  return v_usage;
end $$;

-- Product availability now derives from stock across OPEN salons (0018
-- semantics, multi-salon: in stock anywhere open = purchasable).
create or replace function public.sync_linked_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_available numeric;
  v_reorder numeric;
begin
  select coalesce(sum(sps.quantity_available), 0) into v_available
  from public.salon_product_stock sps
  join public.salons s on s.id = sps.salon_id and s.status = 'open'
  where sps.item_id = new.item_id;
  select reorder_level into v_reorder
  from public.inventory_items where id = new.item_id;

  update public.products p
  set stock_status = public.fn_derived_stock_status(v_available, coalesce(v_reorder, 0))
  where p.inventory_item_id = new.item_id
    and p.stock_status is distinct from
        public.fn_derived_stock_status(v_available, coalesce(v_reorder, 0));
  return new;
end $$;

create trigger trg_sync_product_stock
after insert or update of quantity_on_hand, quantity_reserved
on public.salon_product_stock
for each row execute function public.sync_linked_product_stock();

create or replace function public.sync_product_stock_on_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_available numeric;
  v_reorder numeric;
begin
  if new.inventory_item_id is null then return new; end if;
  select coalesce(sum(sps.quantity_available), 0) into v_available
  from public.salon_product_stock sps
  join public.salons s on s.id = sps.salon_id and s.status = 'open'
  where sps.item_id = new.inventory_item_id;
  select reorder_level into v_reorder
  from public.inventory_items where id = new.inventory_item_id;
  new.stock_status :=
    public.fn_derived_stock_status(v_available, coalesce(v_reorder, 0));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Capacity without the home-service dimension; activation records the
-- member's home salon (v3 §4.4 — attribution only, never a restriction).
-- ---------------------------------------------------------------------------
drop function public.fn_capacity_counts(uuid);

create function public.fn_capacity_counts(p_plan_id uuid)
returns table (plan_active integer, category_active integer, global_active integer)
language sql stable security definer set search_path = public as $$
  with active as (
    select s.plan_id, p.category_id
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.status in ('active', 'expiring_soon', 'renewal_due')
  )
  select
    (select count(*) from active where plan_id = p_plan_id)::integer,
    (select count(*) from active
      where category_id = (select category_id from public.subscription_plans
                           where id = p_plan_id))::integer,
    (select count(*) from active)::integer
$$;

create or replace function public.fn_check_activation_capacity(
  p_plan_id uuid, p_override_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan public.subscription_plans;
  v_settings public.subscription_capacity_settings;
  v_cat_limit integer;
  c record;
  v_blocked text := null;
begin
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  select * into v_settings from public.subscription_capacity_settings limit 1;
  select subscriber_limit into v_cat_limit
    from public.subscription_category_limits where category_id = v_plan.category_id;
  select * into c from public.fn_capacity_counts(p_plan_id);

  if v_plan.subscriber_limit is not null and c.plan_active >= v_plan.subscriber_limit then
    v_blocked := format('plan limit reached (%s/%s)', c.plan_active, v_plan.subscriber_limit);
  elsif v_cat_limit is not null and c.category_active >= v_cat_limit then
    v_blocked := format('category limit reached (%s/%s)', c.category_active, v_cat_limit);
  elsif v_settings.global_active_subscriber_limit is not null
        and c.global_active >= v_settings.global_active_subscriber_limit then
    v_blocked := format('global member limit reached (%s/%s)',
      c.global_active, v_settings.global_active_subscriber_limit);
  end if;

  if v_blocked is null or not v_settings.enforce_hard_stop then
    return;
  end if;

  if coalesce(trim(p_override_reason), '') <> ''
     and public.has_permission('capacity.override') then
    insert into public.capacity_overrides (plan_id, reason, performed_by)
    values (p_plan_id, p_override_reason, auth.uid());
    perform public.write_audit('capacity.override', 'subscription_plan', p_plan_id,
      p_override_reason, jsonb_build_object('blocked_by', v_blocked));
    return;
  end if;

  raise exception 'CAPACITY_FULL: % — activation blocked', v_blocked;
end $$;

drop function public.fn_activate_manual_subscription(uuid, uuid, uuid, date, text, text);

create function public.fn_activate_manual_subscription(
  p_customer_id uuid,
  p_plan_id uuid,
  p_child_id uuid default null,
  p_starts_on date default null,
  p_reason text default 'manual activation',
  p_capacity_override_reason text default null,
  p_home_salon_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan public.subscription_plans;
  v_sub uuid;
  v_cycle uuid;
  v_start date := coalesce(p_starts_on, (now() at time zone 'Africa/Lagos')::date);
  v_home uuid := p_home_salon_id;
  i integer;
begin
  if not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;

  -- Home salon: explicit, else the earliest open salon. Memberships need
  -- at least one open salon to sell against (v3 edge case #39).
  if v_home is null then
    select id into v_home from public.salons where status = 'open'
    order by created_at limit 1;
  elsif not exists (select 1 from public.salons
                    where id = v_home and status = 'open') then
    raise exception 'SALON_UNAVAILABLE: home salon must be an open salon';
  end if;
  if v_home is null then
    raise exception 'SALON_UNAVAILABLE: no open salon to attribute this membership to';
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
    raise exception 'recipient already has an active membership';
  end if;

  perform public.fn_check_activation_capacity(p_plan_id, p_capacity_override_reason);

  insert into public.subscriptions
    (customer_id, child_id, plan_id, plan_version_id, status, created_by,
     activation_source, home_salon_id)
  values
    (p_customer_id, p_child_id, p_plan_id, public.latest_plan_version(p_plan_id),
     'active', auth.uid(), 'manual', v_home)
  returning id into v_sub;

  insert into public.subscription_cycles
    (subscription_id, cycle_number, starts_on, ends_on, visits_included, status)
  values (v_sub, 1, v_start, v_start + interval '1 month', v_plan.visits_included, 'active')
  returning id into v_cycle;

  for i in 1..v_plan.visits_included loop
    insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, i);
  end loop;

  update public.pending_plan_selections
     set status = 'activated'
   where customer_id = p_customer_id
     and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_child_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and status = 'pending_payment';

  perform public.write_audit('subscription.manual_activate', 'subscription', v_sub,
    p_reason, jsonb_build_object('plan_id', p_plan_id, 'customer_id', p_customer_id,
                                 'home_salon_id', v_home));

  return v_sub;
end $$;

-- ---------------------------------------------------------------------------
-- The global tables replaced by per-salon config are now dead — remove them
-- (v3 §4.8: no dormant structure). Brand scheduling_settings keeps only
-- brand-level defaults.
-- ---------------------------------------------------------------------------
drop table public.business_hours;
drop table public.blackout_dates;
alter table public.scheduling_settings drop column slot_duration_minutes;
alter table public.scheduling_settings drop column max_bookings_per_slot;
