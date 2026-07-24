-- 0010 Retention prompt generation + availability slot generation.

-- Internal helper: upsert one auto prompt (keeps dismissal state).
create or replace function public.fn_upsert_retention_prompt(
  p_customer_id uuid, p_key text, p_type text, p_title text, p_message text,
  p_priority integer, p_action_label text, p_action_url text, p_expires date
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.retention_internal', 'on', true);
  insert into public.retention_prompts
    (customer_id, prompt_key, prompt_type, title, message, priority,
     action_label, action_url, expires_on)
  values (p_customer_id, p_key, p_type, p_title, p_message, p_priority,
          p_action_label, p_action_url, p_expires)
  on conflict (customer_id, prompt_key) do update
    set title = excluded.title,
        message = excluded.message,
        priority = excluded.priority,
        action_label = excluded.action_label,
        action_url = excluded.action_url,
        expires_on = excluded.expires_on;
  perform set_config('app.retention_internal', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Retention prompts: idempotent, deduplicated via stable prompt keys.
-- Auto-generated prompts use the 'auto:' prefix; stale ones are removed when
-- their condition no longer holds. Dismissed prompts stay dismissed.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generate_retention_prompts(p_customer_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_keys text[] := '{}';
  r record;
begin
  -- Active cycles: unused visits + expiry warnings + no-booking nudges.
  for r in
    select c.id as cycle_id, c.ends_on, c.starts_on, s.id as sub_id,
           (select count(*) from public.visit_entitlements e
             where e.cycle_id = c.id and e.status = 'available') as available,
           (select count(*) from public.appointments a
             where a.cycle_id = c.id
               and a.status = any (public.live_appointment_statuses())) as live_appts
    from public.subscription_cycles c
    join public.subscriptions s on s.id = c.subscription_id
    where s.customer_id = p_customer_id
      and c.status = 'active'
      and s.status in ('active', 'expiring_soon', 'renewal_due')
  loop
    if r.available > 0 and r.ends_on - v_today <= 10 then
      perform public.fn_upsert_retention_prompt(p_customer_id,
        'auto:visits_expiring:' || r.cycle_id, 'action_required',
        'Visits expiring soon',
        format('You still have %s visit%s remaining this cycle. Unused visits expire on %s and cannot be carried forward.',
               r.available, case when r.available = 1 then '' else 's' end,
               to_char(r.ends_on, 'DD Mon')),
        80, 'Book a visit', '/app/book', r.ends_on);
      v_keys := v_keys || ('auto:visits_expiring:' || r.cycle_id);
    end if;

    if r.live_appts = 0 and r.available > 0 and v_today - r.starts_on >= 7 then
      perform public.fn_upsert_retention_prompt(p_customer_id,
        'auto:no_booking:' || r.cycle_id, 're_engagement',
        'No visit booked yet',
        'You have not booked a visit this cycle. Choose a date that suits you and stay consistent.',
        60, 'Book now', '/app/book', r.ends_on);
      v_keys := v_keys || ('auto:no_booking:' || r.cycle_id);
    end if;

    if r.ends_on - v_today between 0 and 5 then
      perform public.fn_upsert_retention_prompt(p_customer_id,
        'auto:expiring:' || r.sub_id, 'urgent',
        'Subscription expiring soon',
        format('Your subscription expires on %s. Renewal opens in the payments phase — your visits stay valid until then.',
               to_char(r.ends_on, 'DD Mon')),
        90, 'View my plan', '/app/subscription', r.ends_on);
      v_keys := v_keys || ('auto:expiring:' || r.sub_id);
    end if;
  end loop;

  -- Upcoming appointment reminder.
  for r in
    select a.id, a.starts_at from public.appointments a
    where a.customer_id = p_customer_id
      and a.status in ('confirmed', 'assigned', 'pending_confirmation')
      and a.starts_at between now() and now() + interval '3 days'
  loop
    perform public.fn_upsert_retention_prompt(p_customer_id,
      'auto:upcoming:' || r.id, 'info',
      'Your next visit is coming up',
      format('Your appointment is on %s at %s.',
             trim(to_char(r.starts_at at time zone 'Africa/Lagos', 'Day')) || ' ' ||
             to_char(r.starts_at at time zone 'Africa/Lagos', 'DD Mon'),
             to_char(r.starts_at at time zone 'Africa/Lagos', 'HH12:MI AM')),
      40, 'View appointment', '/app/appointments/' || r.id,
      public.lagos_date(r.starts_at));
    v_keys := v_keys || ('auto:upcoming:' || r.id);
  end loop;

  -- Missed appointments in the last 14 days.
  for r in
    select a.id from public.appointments a
    where a.customer_id = p_customer_id and a.status = 'missed'
      and a.starts_at > now() - interval '14 days'
  loop
    perform public.fn_upsert_retention_prompt(p_customer_id,
      'auto:missed:' || r.id, 'action_required',
      'You missed your appointment',
      'Your visit was not used — it is still available. Choose another date that works for you.',
      70, 'Rebook a visit', '/app/book', v_today + 14);
    v_keys := v_keys || ('auto:missed:' || r.id);
  end loop;

  -- Expired subscriptions (only when nothing active remains).
  for r in
    select s.id from public.subscriptions s
    where s.customer_id = p_customer_id and s.status = 'expired'
      and not exists (select 1 from public.subscriptions s2
                      where s2.customer_id = p_customer_id
                        and s2.status in ('active', 'expiring_soon', 'renewal_due'))
    order by s.updated_at desc limit 1
  loop
    perform public.fn_upsert_retention_prompt(p_customer_id,
      'auto:sub_expired:' || r.id, 're_engagement',
      'Your subscription has expired',
      'Renew your plan to continue booking salon visits and stay consistent with your hair care.',
      75, 'Browse plans', '/plans', null);
    v_keys := v_keys || ('auto:sub_expired:' || r.id);
  end loop;

  -- Pending plan selection awaiting payment.
  for r in
    select ps.id, p.name from public.pending_plan_selections ps
    join public.subscription_plans p on p.id = ps.plan_id
    where ps.customer_id = p_customer_id and ps.status = 'pending_payment'
  loop
    perform public.fn_upsert_retention_prompt(p_customer_id,
      'auto:pending_selection:' || r.id, 'action_required',
      'Plan selection awaiting payment',
      format('Your %s selection is saved. Payment activation will be available in the payments phase.', r.name),
      50, 'View selection', '/app/subscription', null);
    v_keys := v_keys || ('auto:pending_selection:' || r.id);
  end loop;

  -- Remove stale auto prompts whose condition no longer holds.
  delete from public.retention_prompts
  where customer_id = p_customer_id
    and prompt_key like 'auto:%'
    and dismissed_at is null
    and not (prompt_key = any (v_keys));

  return coalesce(array_length(v_keys, 1), 0);
end $$;

-- ---------------------------------------------------------------------------
-- Availability: valid start times for a given date/location/duration.
-- Derived from business hours, slot duration, capacity, blackouts, notice
-- and the advance window — never hardcoded.
-- ---------------------------------------------------------------------------
create or replace function public.fn_get_available_slots(
  p_date date,
  p_location text default 'salon',
  p_duration_minutes integer default 60
) returns table (slot_start timestamptz, remaining_capacity integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_settings public.scheduling_settings;
  v_hours public.business_hours;
  v_dow integer := extract(dow from p_date)::integer;
  v_slot time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_used integer;
  v_cap integer;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into v_settings from public.scheduling_settings limit 1;
  select * into v_hours from public.business_hours where day_of_week = v_dow;

  if not found or not v_hours.is_open then return; end if;
  if p_date > v_today + v_settings.max_advance_booking_days then return; end if;
  if exists (select 1 from public.blackout_dates b where b.date = p_date and b.is_full_day) then
    return;
  end if;

  v_slot := v_hours.open_time;
  while v_slot + make_interval(mins => p_duration_minutes) <= v_hours.close_time loop
    v_slot_start := (p_date::text || ' ' || v_slot::text)::timestamp
                    at time zone 'Africa/Lagos';
    v_slot_end := v_slot_start + make_interval(mins => p_duration_minutes);

    if v_slot_start >= now() + make_interval(hours => v_settings.min_booking_notice_hours)
       and not exists (
         select 1 from public.blackout_dates b
         where b.date = p_date and not b.is_full_day
           and v_slot < b.end_time
           and (v_slot + make_interval(mins => p_duration_minutes))::time > b.start_time)
    then
      if p_location = 'home' then
        select count(*) into v_used from public.appointments a
        where a.location_type = 'home'
          and public.lagos_date(a.starts_at) = p_date
          and a.status = any (public.live_appointment_statuses());
        v_cap := v_settings.home_service_capacity_per_day - v_used;
      else
        select count(*) into v_used from public.appointments a
        where a.location_type = 'salon'
          and a.starts_at < v_slot_end and a.ends_at > v_slot_start
          and a.status = any (public.live_appointment_statuses());
        v_cap := v_settings.max_bookings_per_slot - v_used;
      end if;

      if v_cap > 0 then
        slot_start := v_slot_start;
        remaining_capacity := v_cap;
        return next;
      end if;
    end if;

    v_slot := v_slot + make_interval(mins => v_settings.slot_duration_minutes);
  end loop;
end $$;
