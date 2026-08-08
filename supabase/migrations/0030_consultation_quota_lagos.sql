-- ============================================================================
-- 0030 — CONSULTATION QUOTA COUNTS IN LAGOS DAYS (bug fix)
-- Cycle windows are Africa/Lagos dates, but the included-consultation quota
-- compared raw UTC timestamps against them, so bookings made between 23:00
-- and 24:00 UTC (midnight–1am Lagos) fell outside their own cycle window.
-- All day logic is Lagos (architecture rule 5); the count now agrees.
-- ============================================================================

create or replace function public.fn_my_consultation_prices()
returns table (consultation_type_id uuid, price_kobo bigint, benefit text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_customer uuid := public.current_customer_id();
  t record;
  s record;
  v_price bigint;
  v_benefit text;
  v_candidate bigint;
  v_used integer;
  v_has_active boolean := false;
begin
  for t in select * from public.consultation_types
           where is_active order by display_order loop
    v_price := t.price_kobo;
    v_benefit := 'standard';

    if v_customer is not null then
      for s in
        select sub.id as sub_id, b.benefit_type, b.included_per_cycle,
               b.member_price_kobo, c.starts_on, c.ends_on
        from public.subscriptions sub
        join public.plan_consultation_benefits b on b.plan_id = sub.plan_id
          and b.consultation_type_id = t.id
        left join public.subscription_cycles c on c.subscription_id = sub.id
          and c.status = 'active'
        where sub.customer_id = v_customer
          and sub.status in ('active', 'expiring_soon', 'renewal_due')
      loop
        v_has_active := true;
        if s.benefit_type = 'included' then
          -- Quota: free bookings of this type inside the current cycle.
          select count(*) into v_used from public.consultation_bookings cb
          where cb.customer_id = v_customer
            and cb.consultation_type_id = t.id
            and cb.price_kobo = 0
            and cb.status not in ('cancelled', 'expired')
            and s.starts_on is not null
            and (cb.created_at at time zone 'Africa/Lagos')::date >= s.starts_on
            and (cb.created_at at time zone 'Africa/Lagos')::date < s.ends_on;
          if s.starts_on is not null and v_used < s.included_per_cycle then
            v_price := 0;
            v_benefit := 'included';
          elsif v_benefit <> 'included' then
            v_benefit := 'included_used';
          end if;
        elsif s.benefit_type = 'discounted' and v_benefit <> 'included' then
          if s.member_price_kobo < v_price then
            v_price := s.member_price_kobo;
            v_benefit := 'discounted';
          end if;
        end if;
      end loop;

      -- Legacy member discount still applies when no plan benefit won.
      if v_benefit in ('standard', 'included_used') then
        select exists (select 1 from public.subscriptions
                       where customer_id = v_customer
                         and status in ('active', 'expiring_soon', 'renewal_due'))
          into v_has_active;
        if v_has_active and t.subscriber_discount_kobo > 0 then
          v_candidate := greatest(0, t.price_kobo - t.subscriber_discount_kobo);
          if v_candidate < v_price then
            v_price := v_candidate;
            if v_benefit = 'standard' then v_benefit := 'member'; end if;
          end if;
        end if;
      end if;
    end if;

    consultation_type_id := t.id;
    price_kobo := v_price;
    benefit := v_benefit;
    return next;
  end loop;
end $$;
