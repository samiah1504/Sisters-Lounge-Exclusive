-- 0013 Stock operations: immutable movement ledger, receiving, counts,
-- consumption templates and appointment usage. fn_post_stock_movement is the
-- ONLY path that changes item quantities.

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id),
  movement_type text not null check (movement_type in (
    'opening_stock','stock_received','supplier_purchase','salon_usage',
    'retail_sale','appointment_consumption','damage','expired_stock',
    'theft_or_loss','manual_adjustment','return_to_supplier','customer_return',
    'transfer','stock_count_correction','reservation','reservation_release')),
  quantity numeric(12,3) not null, -- signed delta applied to on-hand (or reserved)
  unit text not null,
  quantity_before numeric(12,3) not null,
  quantity_after numeric(12,3) not null,
  cost_value_kobo bigint not null default 0,
  reference_type text,
  reference_id uuid,
  reason text,
  notes text not null default '',
  performed_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_movements_item on public.inventory_movements (item_id, created_at desc);
create index idx_movements_ref on public.inventory_movements (reference_type, reference_id);

-- The ledger is immutable.
create or replace function public.guard_immutable_ledger()
returns trigger language plpgsql as $$
begin
  raise exception 'LEDGER_IMMUTABLE: stock movements cannot be modified or deleted';
end $$;

create trigger trg_movements_immutable
before update or delete on public.inventory_movements
for each row execute function public.guard_immutable_ledger();

-- Movement types that affect reserved quantity instead of on-hand.
create or replace function public.fn_post_stock_movement(
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

  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'inventory item not found'; end if;
  select * into v_settings from public.inventory_settings limit 1;

  if v_is_reservation then
    v_before := v_item.quantity_reserved;
    v_after := v_before + (case when p_movement_type = 'reservation' then abs(p_quantity)
                                else -abs(p_quantity) end);
    if v_after < 0 then v_after := 0; end if;
  else
    v_before := v_item.quantity_on_hand;
    v_after := v_before + p_quantity;
    if v_after < 0 and not v_settings.allow_negative_stock then
      raise exception 'NEGATIVE_STOCK: only % % of % available',
        v_before, v_item.unit, v_item.name;
    end if;
  end if;

  perform set_config('app.stock_internal', 'on', true);
  if v_is_reservation then
    update public.inventory_items set quantity_reserved = v_after,
      updated_by = auth.uid() where id = p_item_id;
  else
    update public.inventory_items set quantity_on_hand = v_after,
      updated_by = auth.uid() where id = p_item_id;
  end if;
  perform set_config('app.stock_internal', '', true);

  insert into public.inventory_movements
    (item_id, movement_type, quantity, unit, quantity_before, quantity_after,
     cost_value_kobo, reference_type, reference_id, reason, notes,
     performed_by, approved_by, metadata)
  values
    (p_item_id, p_movement_type, p_quantity, v_item.unit, v_before, v_after,
     (abs(p_quantity) * v_item.cost_price_kobo)::bigint, p_reference_type,
     p_reference_id, p_reason, coalesce(p_notes, ''), auth.uid(), p_approved_by,
     p_metadata)
  returning id into v_movement;

  return v_movement;
end $$;

-- --------------------------------------------------------- stock receiving --
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id),
  receipt_date date not null default current_date,
  invoice_number text not null default '',
  receipt_url text,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid')),
  status text not null default 'draft'
    check (status in ('draft', 'received', 'partially_received', 'cancelled')),
  notes text not null default '',
  received_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_stock_receipts_updated before update on public.stock_receipts
for each row execute function public.set_updated_at();

create table public.stock_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost_kobo bigint not null default 0 check (unit_cost_kobo >= 0),
  batch_number text,
  expiry_date date,
  unique (receipt_id, item_id)
);

-- Confirm once: posts movements, updates quantities and latest cost price.
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
      r.item_id, 'stock_received', r.quantity,
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

-- ------------------------------------------------------------ stock counts --
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  location text not null default 'salon',
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'submitted', 'approved', 'rejected', 'posted')),
  notes text not null default '',
  started_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_stock_counts_updated before update on public.stock_counts
for each row execute function public.set_updated_at();

create table public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id),
  system_quantity numeric(12,3) not null,
  counted_quantity numeric(12,3) not null,
  variance numeric(12,3) generated always as (counted_quantity - system_quantity) stored,
  reason text not null default '',
  unique (count_id, item_id)
);

create or replace function public.fn_submit_stock_count(p_count_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_permission('inventory.count') then
    raise exception 'permission denied: inventory.count';
  end if;
  update public.stock_counts set status = 'submitted'
   where id = p_count_id and status in ('draft', 'in_progress');
  if not found then raise exception 'STATE: count cannot be submitted'; end if;
end $$;

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

  -- Self-approval of high-value adjustments is admin-only.
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
      r.item_id, 'stock_count_correction', r.variance,
      coalesce(nullif(r.reason, ''), 'stock count variance'),
      'stock_count', p_count_id, '', '{}'::jsonb, auth.uid());
  end loop;

  update public.stock_counts
     set status = 'posted', approved_by = auth.uid()
   where id = p_count_id;

  perform public.write_audit('inventory.count_posted', 'stock_count', p_count_id,
    p_reason, jsonb_build_object('variance_value_kobo', v_total_variance_value));
end $$;

-- ------------------------------------------------ consumption templates ----
create table public.service_consumption_templates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services (id) on delete cascade,
  extra_service_id uuid references public.extra_services (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id),
  standard_quantity numeric(12,3) not null check (standard_quantity > 0),
  unit text not null,
  is_required boolean not null default true,
  customer_category_id uuid references public.subscription_categories (id),
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((service_id is null) <> (extra_service_id is null))
);

create index idx_sct_service on public.service_consumption_templates (service_id);
create index idx_sct_extra on public.service_consumption_templates (extra_service_id);

-- ------------------------------------------------ appointment usage --------
create table public.appointment_inventory_usage (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id),
  posted_by uuid references public.profiles (id),
  posted_at timestamptz not null default now(),
  total_cost_kobo bigint not null default 0
);

create table public.appointment_inventory_usage_items (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.appointment_inventory_usage (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id),
  planned_quantity numeric(12,3) not null default 0,
  actual_quantity numeric(12,3) not null check (actual_quantity >= 0),
  unit text not null,
  unit_cost_kobo bigint not null default 0,
  variance_reason text
);

-- Post confirmed consumption exactly once. p_items: [{item_id, planned, actual, reason}]
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
    raise exception 'STATE: consumption is confirmed only for completed appointments';
  end if;
  if exists (select 1 from public.appointment_inventory_usage
             where appointment_id = p_appointment_id) then
    raise exception 'ALREADY_POSTED: consumption was already confirmed for this appointment';
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

    -- Significant deviation (>25% of planned) needs a reason.
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
        r.item_id, 'appointment_consumption', -r.actual,
        'appointment consumption', 'appointment', p_appointment_id);
      v_total := v_total + (r.actual * v_item.cost_price_kobo)::bigint;
    end if;
  end loop;

  update public.appointment_inventory_usage
     set total_cost_kobo = v_total where id = v_usage;
  return v_usage;
end $$;
