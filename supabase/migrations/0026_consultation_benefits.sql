-- ============================================================================
-- 0026 — EXPERT CONSULTATION MEMBERSHIP BENEFITS (v3 Session C2, owner
-- ruling C2). Plans may include Expert Consultations free ("included",
-- capped per cycle) or at a member price ("discounted"); everyone else
-- pays the standard price (minus the legacy member discount, if any).
-- The database resolves the price so the booking snapshot is authoritative.
-- ============================================================================

create table public.plan_consultation_benefits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  consultation_type_id uuid not null references public.consultation_types (id) on delete cascade,
  benefit_type text not null check (benefit_type in ('included', 'discounted')),
  -- Included: free with membership, at most this many per cycle.
  included_per_cycle integer not null default 1 check (included_per_cycle between 1 and 31),
  -- Discounted: the price a member on this plan pays.
  member_price_kobo bigint not null default 0 check (member_price_kobo >= 0),
  created_at timestamptz not null default now(),
  unique (plan_id, consultation_type_id),
  check (benefit_type = 'discounted' or member_price_kobo = 0)
);

alter table public.plan_consultation_benefits enable row level security;
-- Pricing is part of the public plan promise — anyone may read it.
create policy pcb_read on public.plan_consultation_benefits
  for select using (true);
create policy pcb_manage on public.plan_consultation_benefits
  for all using (public.has_permission('plans.manage'));

-- ---------------------------------------------------------------------------
-- Member pricing for every active consultation type, for the signed-in
-- member. benefit: included | included_used | discounted | member | standard.
-- "included_used" = the free quota for this cycle is exhausted; the row
-- falls back to the best remaining price.
-- ---------------------------------------------------------------------------
create function public.fn_my_consultation_prices()
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
            and cb.created_at >= s.starts_on
            and cb.created_at < s.ends_on;
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

-- Authoritative single-type price for the booking snapshot.
create function public.fn_consultation_price(p_type_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select price_kobo from public.fn_my_consultation_prices()
  where consultation_type_id = p_type_id
$$;
