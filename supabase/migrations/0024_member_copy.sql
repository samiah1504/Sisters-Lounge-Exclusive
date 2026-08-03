-- ============================================================================
-- 0024 — MEMBER LANGUAGE IN GENERATED PROMPTS (v3 Session B, §2)
-- Copy-only: re-creates fn_generate_retention_prompts with members' club
-- vocabulary (member, membership, reserve visit). Logic unchanged from 0010.
-- ============================================================================

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
        80, 'Reserve a visit', '/app/book', r.ends_on);
      v_keys := v_keys || ('auto:visits_expiring:' || r.cycle_id);
    end if;

    if r.live_appts = 0 and r.available > 0 and v_today - r.starts_on >= 7 then
      perform public.fn_upsert_retention_prompt(p_customer_id,
        'auto:no_booking:' || r.cycle_id, 're_engagement',
        'No visit reserved yet',
        'You have not reserved a visit this cycle. Choose a date that suits you and stay consistent.',
        60, 'Reserve now', '/app/book', r.ends_on);
      v_keys := v_keys || ('auto:no_booking:' || r.cycle_id);
    end if;

    if r.ends_on - v_today between 0 and 5 then
      perform public.fn_upsert_retention_prompt(p_customer_id,
        'auto:expiring:' || r.sub_id, 'urgent',
        'Membership cycle ending soon',
        format('Your membership cycle ends on %s. Renewal opens in the payments phase — your visits stay valid until then.',
               to_char(r.ends_on, 'DD Mon')),
        90, 'View my membership', '/app/subscription', r.ends_on);
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
      format('Your reserved visit is on %s at %s.',
             trim(to_char(r.starts_at at time zone 'Africa/Lagos', 'Day')) || ' ' ||
             to_char(r.starts_at at time zone 'Africa/Lagos', 'DD Mon'),
             to_char(r.starts_at at time zone 'Africa/Lagos', 'HH12:MI AM')),
      40, 'View visit', '/app/appointments/' || r.id,
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
      'You missed your visit',
      'Your visit was not used — it is still available. Choose another date that works for you.',
      70, 'Reserve another visit', '/app/book', v_today + 14);
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
      'Your membership has expired',
      'Renew your membership to keep reserving salon visits and stay consistent with your hair care.',
      75, 'Browse memberships', '/plans', null);
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
      'Membership selection awaiting payment',
      format('Your %s membership selection is saved. Payment activation will be available in the payments phase.', r.name),
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
