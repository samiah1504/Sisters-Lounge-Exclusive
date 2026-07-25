-- 0017 Subscription capacity settings + enforcement, Phase 3 permissions,
-- and RLS for every Phase 3 table.

-- ---------------------------------------------------------------- capacity --
create table public.subscription_capacity_settings (
  id boolean primary key default true check (id),
  global_active_subscriber_limit integer check (global_active_subscriber_limit > 0),
  home_service_subscriber_limit integer check (home_service_subscriber_limit > 0),
  max_promised_visits_per_cycle integer check (max_promised_visits_per_cycle > 0),
  warning_threshold_percent integer not null default 80
    check (warning_threshold_percent between 1 and 100),
  hard_stop_threshold_percent integer not null default 100
    check (hard_stop_threshold_percent between 1 and 150),
  enforce_hard_stop boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_capacity_settings_updated
before update on public.subscription_capacity_settings
for each row execute function public.set_updated_at();

insert into public.subscription_capacity_settings (id) values (true);

create table public.subscription_category_limits (
  category_id uuid primary key references public.subscription_categories (id) on delete cascade,
  subscriber_limit integer not null check (subscriber_limit > 0),
  updated_at timestamptz not null default now()
);

create table public.capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions (id),
  plan_id uuid references public.subscription_plans (id),
  reason text not null check (length(reason) > 0),
  performed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Active-subscriber counters used for enforcement and dashboards.
create or replace function public.fn_capacity_counts(p_plan_id uuid)
returns table (plan_active integer, category_active integer, global_active integer,
               home_active integer)
language sql stable security definer set search_path = public as $$
  with active as (
    select s.plan_id, p.category_id, p.location_type
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.status in ('active', 'expiring_soon', 'renewal_due')
  )
  select
    (select count(*) from active where plan_id = p_plan_id)::integer,
    (select count(*) from active
      where category_id = (select category_id from public.subscription_plans
                           where id = p_plan_id))::integer,
    (select count(*) from active)::integer,
    (select count(*) from active where location_type = 'home')::integer
$$;

-- Enforce limits at manual activation. Overrides need capacity.override + reason.
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
    v_blocked := format('global subscriber limit reached (%s/%s)',
      c.global_active, v_settings.global_active_subscriber_limit);
  elsif v_plan.location_type = 'home'
        and v_settings.home_service_subscriber_limit is not null
        and c.home_active >= v_settings.home_service_subscriber_limit then
    v_blocked := format('home-service limit reached (%s/%s)',
      c.home_active, v_settings.home_service_subscriber_limit);
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

-- Re-create manual activation with capacity enforcement (adds override arg).
drop function if exists public.fn_activate_manual_subscription(uuid, uuid, uuid, date, text);
create or replace function public.fn_activate_manual_subscription(
  p_customer_id uuid,
  p_plan_id uuid,
  p_child_id uuid default null,
  p_starts_on date default null,
  p_reason text default 'manual activation',
  p_capacity_override_reason text default null
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

  perform public.fn_check_activation_capacity(p_plan_id, p_capacity_override_reason);

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

-- ------------------------------------------------------------- permissions --
insert into public.permissions (key, description) values
  ('inventory.view', 'View inventory items and movements'),
  ('inventory.manage', 'Create and edit inventory items and categories'),
  ('inventory.receive', 'Record and confirm stock receipts'),
  ('inventory.adjust', 'Post manual stock adjustments'),
  ('inventory.count', 'Run stock counts'),
  ('inventory.approve_adjustment', 'Approve stock counts and adjustments'),
  ('inventory.view_cost', 'See inventory cost prices and values'),
  ('suppliers.view', 'View suppliers'),
  ('suppliers.manage', 'Create and edit suppliers'),
  ('suppliers.view_sensitive', 'View supplier bank details'),
  ('equipment.view', 'View the equipment register'),
  ('equipment.manage', 'Manage equipment and maintenance records'),
  ('consumption.post', 'Confirm appointment inventory usage'),
  ('expenses.view', 'View expenses'),
  ('expenses.create', 'Create draft expenses'),
  ('expenses.edit_draft', 'Edit draft expenses'),
  ('expenses.submit', 'Submit expenses for approval'),
  ('expenses.approve', 'Approve expenses'),
  ('expenses.reject', 'Reject expenses'),
  ('expenses.mark_paid', 'Mark approved expenses as paid'),
  ('expenses.void', 'Void expenses'),
  ('expenses.export', 'Export expense data'),
  ('expenses.view_sensitive', 'View sensitive expense details'),
  ('support.view', 'View support conversations'),
  ('support.reply', 'Reply to support conversations'),
  ('support.assign', 'Assign support conversations'),
  ('support.manage', 'Manage saved replies and conversation status'),
  ('support.internal_notes', 'Read and write internal support notes'),
  ('capacity.view', 'View capacity dashboards'),
  ('capacity.manage', 'Edit capacity settings and limits'),
  ('capacity.override', 'Override capacity limits with a reason'),
  ('operations.dashboard.view', 'View the operations dashboard');

insert into public.role_permissions (role, permission_key) values
  ('staff', 'inventory.view'),
  ('staff', 'inventory.receive'),
  ('staff', 'inventory.count'),
  ('staff', 'consumption.post'),
  ('staff', 'expenses.view'),
  ('staff', 'expenses.create'),
  ('staff', 'expenses.edit_draft'),
  ('staff', 'expenses.submit'),
  ('staff', 'support.view'),
  ('staff', 'support.reply'),
  ('staff', 'support.internal_notes');

-- --------------------------------------------------------------------- RLS --
alter table public.inventory_units enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_bank_details enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_settings enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.service_consumption_templates enable row level security;
alter table public.appointment_inventory_usage enable row level security;
alter table public.appointment_inventory_usage_items enable row level security;
alter table public.equipment_assets enable row level security;
alter table public.equipment_logs enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expense_settings enable row level security;
alter table public.expenses enable row level security;
alter table public.recurring_expense_templates enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_saved_replies enable row level security;
alter table public.subscription_capacity_settings enable row level security;
alter table public.subscription_category_limits enable row level security;
alter table public.capacity_overrides enable row level security;

-- Inventory: staff/admin only. Customers never see costs or stock internals.
create policy inv_units_read on public.inventory_units
  for select using (public.is_staff_or_admin());
create policy inv_units_manage on public.inventory_units
  for all using (public.has_permission('inventory.manage'));
create policy inv_categories_read on public.inventory_categories
  for select using (public.is_staff_or_admin());
create policy inv_categories_manage on public.inventory_categories
  for all using (public.has_permission('inventory.manage'));
create policy inv_items_read on public.inventory_items
  for select using (public.has_permission('inventory.view'));
create policy inv_items_manage on public.inventory_items
  for all using (public.has_permission('inventory.manage'));
create policy inv_settings_read on public.inventory_settings
  for select using (public.is_staff_or_admin());
create policy inv_settings_manage on public.inventory_settings
  for all using (public.is_admin());
create policy inv_movements_read on public.inventory_movements
  for select using (public.has_permission('inventory.view'));
-- movements insert only via definer function (no insert policy)

create policy suppliers_read on public.suppliers
  for select using (public.has_permission('suppliers.view')
                    or public.has_permission('inventory.view'));
create policy suppliers_manage on public.suppliers
  for all using (public.has_permission('suppliers.manage'));
create policy supplier_bank_restricted on public.supplier_bank_details
  for all using (public.has_permission('suppliers.view_sensitive'));

create policy receipts_read on public.stock_receipts
  for select using (public.has_permission('inventory.view'));
create policy receipts_write on public.stock_receipts
  for insert with check (public.has_permission('inventory.receive'));
create policy receipts_update on public.stock_receipts
  for update using (public.has_permission('inventory.receive'));
create policy receipt_items_read on public.stock_receipt_items
  for select using (public.has_permission('inventory.view'));
create policy receipt_items_write on public.stock_receipt_items
  for all using (public.has_permission('inventory.receive'));

create policy counts_read on public.stock_counts
  for select using (public.has_permission('inventory.view'));
create policy counts_write on public.stock_counts
  for insert with check (public.has_permission('inventory.count'));
create policy counts_update on public.stock_counts
  for update using (public.has_permission('inventory.count'));
create policy count_items_all on public.stock_count_items
  for all using (public.has_permission('inventory.count'));

create policy sct_read on public.service_consumption_templates
  for select using (public.is_staff_or_admin());
create policy sct_manage on public.service_consumption_templates
  for all using (public.has_permission('inventory.manage'));

create policy usage_read on public.appointment_inventory_usage
  for select using (public.has_permission('inventory.view')
                    or public.has_permission('appointments.view'));
create policy usage_items_read on public.appointment_inventory_usage_items
  for select using (public.has_permission('inventory.view')
                    or public.has_permission('appointments.view'));
-- usage rows insert only via fn_post_appointment_consumption

create policy equipment_read on public.equipment_assets
  for select using (public.has_permission('equipment.view')
                    or public.is_staff_or_admin());
create policy equipment_manage on public.equipment_assets
  for all using (public.has_permission('equipment.manage'));
create policy equipment_logs_read on public.equipment_logs
  for select using (public.is_staff_or_admin());
create policy equipment_logs_write on public.equipment_logs
  for insert with check (public.has_permission('equipment.manage'));

create policy expense_categories_read on public.expense_categories
  for select using (public.is_staff_or_admin());
create policy expense_categories_manage on public.expense_categories
  for all using (public.is_admin());
create policy expense_settings_read on public.expense_settings
  for select using (public.is_staff_or_admin());
create policy expense_settings_manage on public.expense_settings
  for all using (public.is_admin());

create policy expenses_read on public.expenses
  for select using (public.has_permission('expenses.view'));
create policy expenses_insert on public.expenses
  for insert with check (public.has_permission('expenses.create')
                         and entered_by = auth.uid());
create policy expenses_update_draft on public.expenses
  for update using (
    (status = 'draft' and entered_by = auth.uid()
     and public.has_permission('expenses.edit_draft'))
    or public.is_admin());
create policy expenses_delete_draft on public.expenses
  for delete using (status = 'draft' and entered_by = auth.uid());

create policy recurring_read on public.recurring_expense_templates
  for select using (public.has_permission('expenses.view'));
create policy recurring_manage on public.recurring_expense_templates
  for all using (public.has_permission('expenses.approve') or public.is_admin());

-- Support chat: customers own their conversations; internal notes staff-only.
create policy conversations_customer on public.support_conversations
  for select using (customer_id = public.current_customer_id()
                    or public.has_permission('support.view'));
create policy conversations_customer_insert on public.support_conversations
  for insert with check (customer_id = public.current_customer_id());
create policy conversations_customer_update on public.support_conversations
  for update using (customer_id = public.current_customer_id()
                    or public.has_permission('support.view'));

create policy messages_read on public.support_messages
  for select using (
    (not is_internal_note
     and hidden_at is null
     and exists (select 1 from public.support_conversations c
                 where c.id = conversation_id
                   and c.customer_id = public.current_customer_id()))
    or (public.has_permission('support.view')
        and (not is_internal_note or public.has_permission('support.internal_notes'))));
create policy messages_insert on public.support_messages
  for insert with check (
    exists (select 1 from public.support_conversations c
            where c.id = conversation_id
              and c.customer_id = public.current_customer_id())
    or public.has_permission('support.reply'));
create policy messages_hide on public.support_messages
  for update using (public.has_permission('support.manage'));

create policy saved_replies_read on public.support_saved_replies
  for select using (public.is_staff_or_admin());
create policy saved_replies_manage on public.support_saved_replies
  for all using (public.has_permission('support.manage'));

create policy capacity_settings_read on public.subscription_capacity_settings
  for select using (public.is_staff_or_admin());
create policy capacity_settings_manage on public.subscription_capacity_settings
  for all using (public.has_permission('capacity.manage') or public.is_admin());
create policy category_limits_read on public.subscription_category_limits
  for select using (public.is_staff_or_admin());
create policy category_limits_manage on public.subscription_category_limits
  for all using (public.has_permission('capacity.manage') or public.is_admin());
create policy overrides_read on public.capacity_overrides
  for select using (public.is_admin());
