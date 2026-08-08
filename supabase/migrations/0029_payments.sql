-- ============================================================================
-- 0029 — AUTOMATIC SUBSCRIPTION PAYMENTS (payments spec §5, §6, §11, §12, §15)
-- Paystack-managed recurring billing. Membership stays the domain concept
-- (subscriptions/cycles/entitlements); the billing relationship lives in
-- payment_subscriptions; every provider charge lands in payments; every
-- webhook delivery lands once in payment_events (idempotency).
-- The webhook is the authoritative confirmation — the browser never activates.
-- ============================================================================

-- ------------------------------------------------- plan → provider mapping --
-- Each sellable plan maps to a Paystack Plan (payments spec §3). Created
-- lazily by the server at first checkout; a price edit mints a new provider
-- plan (existing subscribers keep their old billing amount — plan-versioning
-- philosophy applied to billing).
alter table public.subscription_plans
  add column provider_plan_code text,
  add column provider_plan_amount_kobo bigint;

-- ---------------------------------------- home salon chosen during checkout --
alter table public.pending_plan_selections
  add column home_salon_id uuid references public.salons (id);

-- Intents can now be fulfilled by an online payment as well as offline.
alter table public.pending_payment_intents
  drop constraint pending_payment_intents_status_check;
alter table public.pending_payment_intents
  add constraint pending_payment_intents_status_check
  check (status in ('pending', 'superseded', 'cancelled',
                    'fulfilled_offline', 'fulfilled_online'));

-- ------------------------------------------------------ billing relationship --
-- One per membership (payments spec §15). Card fields are display metadata
-- from the provider's authorization — never raw card details (§5).
create table public.payment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique
    references public.subscriptions (id) on delete cascade,
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_customer_code text,
  provider_subscription_code text unique,
  provider_email_token text,
  provider_plan_code text,
  provider_authorization_code text,
  card_brand text,
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_exp_month integer check (card_exp_month between 1 and 12),
  card_exp_year integer,
  amount_kobo bigint not null check (amount_kobo >= 0),
  billing_interval text not null default 'monthly'
    check (billing_interval = 'monthly'),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'payment_failed',
                      'cancelling', 'cancelled', 'completed')),
  next_billing_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_payment_subscriptions_updated
before update on public.payment_subscriptions
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ payment history --
-- provider_reference is unique: the same provider charge can never be
-- recorded twice (payments spec §12 idempotency).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  payment_subscription_id uuid
    references public.payment_subscriptions (id) on delete set null,
  intent_id uuid references public.pending_payment_intents (id) on delete set null,
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_reference text not null unique,
  kind text not null check (kind in ('initial', 'renewal', 'other')),
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null check (status in ('success', 'failed', 'refunded')),
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_payments_customer on public.payments (customer_id);
create index idx_payments_subscription on public.payments (subscription_id);

-- ------------------------------------------------------------- webhook ledger --
-- Every delivered event is recorded once. Paystack events carry no id, so
-- the key is computed (event type + provider reference); a duplicate delivery
-- violates the unique key and is skipped (payments spec §12).
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack' check (provider = 'paystack'),
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'processed'
    check (status in ('processed', 'skipped', 'error')),
  note text,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activation, re-created: capacity no longer gates membership purchase or
-- activation in any path (owner decision — capacity applies only when
-- reserving a visit); trusted no-session contexts (webhook) may call it; the
-- activation source is recorded honestly.
-- ---------------------------------------------------------------------------
drop function public.fn_activate_manual_subscription(uuid, uuid, uuid, date, text, text, uuid);

create function public.fn_activate_manual_subscription(
  p_customer_id uuid,
  p_plan_id uuid,
  p_child_id uuid default null,
  p_starts_on date default null,
  p_reason text default 'manual activation',
  p_home_salon_id uuid default null,
  p_activation_source text default 'manual'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan public.subscription_plans;
  v_sub uuid;
  v_cycle uuid;
  v_start date := coalesce(p_starts_on, (now() at time zone 'Africa/Lagos')::date);
  v_home uuid := p_home_salon_id;
  i integer;
begin
  -- Trusted server contexts (webhook / definer callers) have no auth.uid(),
  -- same convention as guard_profile_update. Signed-in users still need the
  -- permission — a member can never activate a membership via direct RPC.
  if auth.uid() is not null and not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;
  if p_activation_source not in ('manual', 'payment', 'migration') then
    raise exception 'invalid activation source';
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

  insert into public.subscriptions
    (customer_id, child_id, plan_id, plan_version_id, status, created_by,
     activation_source, home_salon_id)
  values
    (p_customer_id, p_child_id, p_plan_id, public.latest_plan_version(p_plan_id),
     'active', auth.uid(), p_activation_source, v_home)
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
                                 'home_salon_id', v_home,
                                 'activation_source', p_activation_source));

  return v_sub;
end $$;


-- ---------------------------------------------------------------------------
-- Plan selection, re-created with the checkout home-salon choice.
-- ---------------------------------------------------------------------------
drop function public.fn_select_plan(uuid, uuid);

create function public.fn_select_plan(
  p_plan_id uuid, p_child_id uuid default null, p_home_salon_id uuid default null)
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

  -- Home salon chosen at checkout must be an open salon (payments spec §4).
  if p_home_salon_id is not null and not exists (
      select 1 from public.salons where id = p_home_salon_id and status = 'open') then
    raise exception 'SALON_UNAVAILABLE: home salon must be an open salon';
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

  insert into public.pending_plan_selections
    (customer_id, child_id, plan_id, plan_version_id, home_salon_id)
  values (v_customer, p_child_id, p_plan_id, public.latest_plan_version(p_plan_id),
          p_home_salon_id)
  returning id into v_selection;

  insert into public.pending_payment_intents
    (purpose, customer_id, pending_selection_id, amount_kobo)
  values ('subscription_activation', v_customer, v_selection, v_plan.monthly_price_kobo);

  return v_selection;
end $$;

-- ---------------------------------------------------------------------------
-- Paid activation (payments spec §6): called by the webhook after the
-- provider confirms the initial charge. Reuses fn_activate_manual_subscription
-- — entitlement logic is never duplicated (§7). Idempotent on the provider
-- charge reference AND on the intent state: replaying the same event cannot
-- create a second membership, cycle, entitlement or payment row.
-- ---------------------------------------------------------------------------
create function public.fn_activate_paid_subscription(
  p_intent_id uuid,
  p_provider_reference text,
  p_amount_kobo bigint,
  p_provider_customer_code text default null,
  p_provider_plan_code text default null,
  p_authorization jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_intent public.pending_payment_intents;
  v_sel public.pending_plan_selections;
  v_sub uuid;
  v_existing uuid;
begin
  if auth.uid() is not null and not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;

  -- Duplicate charge event → return the membership it already produced.
  select subscription_id into v_existing
  from public.payments where provider_reference = p_provider_reference;
  if found then
    return v_existing;
  end if;

  select * into v_intent from public.pending_payment_intents
  where id = p_intent_id for update;
  if not found or v_intent.purpose <> 'subscription_activation' then
    raise exception 'PAYMENT_INTENT: unknown activation intent';
  end if;
  if v_intent.status <> 'pending' then
    -- Same intent already fulfilled under another reference (double charge):
    -- record nothing here; the operations team resolves refunds manually.
    raise exception 'PAYMENT_INTENT: intent is % — expected pending', v_intent.status;
  end if;
  if p_amount_kobo < v_intent.amount_kobo then
    raise exception 'PAYMENT_AMOUNT: charged % kobo but % kobo is due',
      p_amount_kobo, v_intent.amount_kobo;
  end if;

  select * into v_sel from public.pending_plan_selections
  where id = v_intent.pending_selection_id;
  if not found or v_sel.status <> 'pending_payment' then
    raise exception 'PAYMENT_INTENT: plan selection no longer pending';
  end if;

  v_sub := public.fn_activate_manual_subscription(
    v_sel.customer_id, v_sel.plan_id, v_sel.child_id, null,
    'automatic activation on confirmed payment ' || p_provider_reference,
    v_sel.home_salon_id, 'payment');

  insert into public.payments
    (customer_id, subscription_id, intent_id, provider_reference, kind,
     amount_kobo, status, paid_at)
  values
    (v_sel.customer_id, v_sub, p_intent_id, p_provider_reference, 'initial',
     p_amount_kobo, 'success', now());

  insert into public.payment_subscriptions
    (subscription_id, provider_customer_code, provider_plan_code,
     provider_authorization_code, card_brand, card_last4,
     card_exp_month, card_exp_year, amount_kobo, status)
  values
    (v_sub, p_provider_customer_code, p_provider_plan_code,
     p_authorization ->> 'authorization_code',
     p_authorization ->> 'brand',
     nullif(p_authorization ->> 'last4', ''),
     nullif(p_authorization ->> 'exp_month', '')::integer,
     nullif(p_authorization ->> 'exp_year', '')::integer,
     v_intent.amount_kobo, 'active');

  update public.payments set payment_subscription_id =
    (select id from public.payment_subscriptions where subscription_id = v_sub)
  where provider_reference = p_provider_reference;

  update public.pending_payment_intents
     set status = 'fulfilled_online' where id = p_intent_id;

  perform public.write_audit('subscription.paid_activate', 'subscription', v_sub,
    'initial payment confirmed by provider webhook',
    jsonb_build_object('provider_reference', p_provider_reference,
                       'amount_kobo', p_amount_kobo));

  return v_sub;
end $$;

-- ---------------------------------------------------------------------------
-- Renewal (payments spec §7): each successful recurring charge creates the
-- next cycle with the plan's entitlements — same rules as activation, one
-- place. Contiguous when on time (new cycle starts when the old one ends);
-- starts today when the membership had lapsed. A queued plan change
-- (next_plan_id, "plan changes take effect next cycle") is applied here.
-- Idempotent on the provider charge reference.
-- ---------------------------------------------------------------------------
create function public.fn_renew_subscription_cycle(
  p_subscription_id uuid,
  p_provider_reference text,
  p_amount_kobo bigint,
  p_next_billing_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_last public.subscription_cycles;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_start date;
  v_cycle uuid;
  i integer;
begin
  if auth.uid() is not null and not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;

  if exists (select 1 from public.payments
             where provider_reference = p_provider_reference) then
    select id into v_cycle from public.subscription_cycles
    where subscription_id = p_subscription_id
    order by cycle_number desc limit 1;
    return v_cycle;
  end if;

  select * into v_sub from public.subscriptions
  where id = p_subscription_id for update;
  if not found then
    raise exception 'subscription not found';
  end if;
  if v_sub.status in ('archived', 'cancelled_by_admin') then
    raise exception 'STATE: % memberships do not renew', v_sub.status;
  end if;

  -- Queued plan change takes effect on this renewal.
  if v_sub.next_plan_id is not null then
    update public.subscriptions
       set plan_id = next_plan_id,
           plan_version_id = public.latest_plan_version(next_plan_id),
           next_plan_id = null
     where id = v_sub.id;
    select * into v_sub from public.subscriptions where id = v_sub.id;
  end if;

  select * into v_plan from public.subscription_plans where id = v_sub.plan_id;

  select * into v_last from public.subscription_cycles
  where subscription_id = v_sub.id
  order by cycle_number desc limit 1;

  v_start := case
    when v_last.id is not null and v_last.ends_on > v_today then v_last.ends_on
    else v_today end;

  insert into public.subscription_cycles
    (subscription_id, cycle_number, starts_on, ends_on, visits_included, status)
  values (v_sub.id, coalesce(v_last.cycle_number, 0) + 1, v_start,
          v_start + interval '1 month', v_plan.visits_included, 'active')
  returning id into v_cycle;

  for i in 1..v_plan.visits_included loop
    insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, i);
  end loop;

  update public.subscriptions set status = 'active' where id = v_sub.id;

  insert into public.payments
    (customer_id, subscription_id, payment_subscription_id, provider_reference,
     kind, amount_kobo, status, paid_at)
  values
    (v_sub.customer_id, v_sub.id,
     (select id from public.payment_subscriptions where subscription_id = v_sub.id),
     p_provider_reference, 'renewal', p_amount_kobo, 'success', now());

  update public.payment_subscriptions
     set status = 'active',
         next_billing_at = coalesce(p_next_billing_at, next_billing_at)
   where subscription_id = v_sub.id;

  perform public.write_audit('subscription.renew', 'subscription', v_sub.id,
    'recurring payment confirmed by provider webhook',
    jsonb_build_object('provider_reference', p_provider_reference,
                       'cycle_id', v_cycle, 'amount_kobo', p_amount_kobo));

  return v_cycle;
end $$;

-- ---------------------------------------------------------------------------
-- Failed recurring payment (payments spec §11): record it, surface it,
-- never destroy membership history. The provider retries on its own
-- schedule; a later successful charge renews normally.
-- ---------------------------------------------------------------------------
create function public.fn_record_payment_failure(
  p_subscription_id uuid,
  p_provider_reference text default null,
  p_amount_kobo bigint default 0,
  p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions;
begin
  if auth.uid() is not null and not public.has_permission('subscriptions.manage') then
    raise exception 'permission denied: subscriptions.manage';
  end if;

  select * into v_sub from public.subscriptions
  where id = p_subscription_id for update;
  if not found then
    raise exception 'subscription not found';
  end if;

  if p_provider_reference is not null then
    insert into public.payments
      (customer_id, subscription_id, payment_subscription_id,
       provider_reference, kind, amount_kobo, status, failure_reason)
    values
      (v_sub.customer_id, v_sub.id,
       (select id from public.payment_subscriptions
        where subscription_id = v_sub.id),
       p_provider_reference, 'renewal', p_amount_kobo, 'failed', p_reason)
    on conflict (provider_reference) do nothing;
  end if;

  update public.subscriptions set status = 'payment_failed'
   where id = v_sub.id
     and status in ('active', 'expiring_soon', 'renewal_due', 'expired');

  update public.payment_subscriptions set status = 'payment_failed'
   where subscription_id = v_sub.id and status in ('pending', 'active');

  perform public.write_audit('subscription.payment_failed', 'subscription',
    v_sub.id, coalesce(p_reason, 'recurring payment failed'),
    jsonb_build_object('provider_reference', p_provider_reference));
end $$;

-- --------------------------------------------------------------------- RLS --
-- Members read their own billing and payment history; staff read with the
-- existing subscriptions.view permission; nothing is writable outside the
-- definer functions and trusted server contexts (payments spec §18 security).
alter table public.payment_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

create policy payment_subscriptions_read on public.payment_subscriptions
  for select using (
    public.has_permission('subscriptions.view')
    or exists (select 1 from public.subscriptions s
               where s.id = subscription_id
                 and s.customer_id = public.current_customer_id()));

create policy payments_read on public.payments
  for select using (
    public.has_permission('subscriptions.view')
    or customer_id = public.current_customer_id());

create policy payment_events_admin_read on public.payment_events
  for select using (public.is_admin());

grant select on public.payment_subscriptions, public.payments to authenticated;
grant select on public.payment_events to authenticated;
