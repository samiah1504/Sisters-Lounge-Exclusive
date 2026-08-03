-- ============================================================================
-- 0020 — SALON SCOPING + BACKFILL (v3 §4.2, §4.4, §4.5)
-- Adds the salon dimension to every operational table, backfills all
-- existing rows to the Ilorin salon, then locks the columns NOT NULL.
-- Memberships stay global; home_salon_id attributes, never restricts.
-- ============================================================================

-- ---------------------------------------------------------------- visits ----
alter table public.appointments
  add column salon_id uuid references public.salons (id);
update public.appointments
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.appointments alter column salon_id set not null;
create index idx_appt_salon_starts on public.appointments (salon_id, starts_at);

-- ------------------------------------------------------------ memberships ---
-- Chosen at signup; used for defaulting + attribution. Restricts NOTHING:
-- visits are portable to any open salon (v3 §4.4).
alter table public.subscriptions
  add column home_salon_id uuid references public.salons (id);
update public.subscriptions
  set home_salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.subscriptions alter column home_salon_id set not null;
create index idx_subs_home_salon on public.subscriptions (home_salon_id);

-- ---------------------------------------------------------- staff schedule --
-- Schedules are per salon per day (v3 edge case #36).
alter table public.staff_working_hours
  add column salon_id uuid references public.salons (id);
update public.staff_working_hours
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.staff_working_hours alter column salon_id set not null;
alter table public.staff_working_hours
  drop constraint staff_working_hours_staff_profile_id_day_of_week_start_time_key;
alter table public.staff_working_hours
  add unique (staff_profile_id, salon_id, day_of_week, start_time);

alter table public.staff_time_off
  add column salon_id uuid references public.salons (id);
update public.staff_time_off
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.staff_time_off alter column salon_id set not null;

-- -------------------------------------------------------------- inventory ---
-- Items stay a global catalogue; stock lives per salon (v3 §4.5).
-- The ledger remains the only write path — 0022 rewires the functions and
-- guard triggers onto this table and drops the per-item quantity columns.
create table public.salon_product_stock (
  salon_id uuid not null references public.salons (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity_on_hand numeric(12, 3) not null default 0,
  quantity_reserved numeric(12, 3) not null default 0,
  quantity_available numeric(12, 3) generated always as
    (quantity_on_hand - quantity_reserved) stored,
  reorder_level numeric(12, 3),          -- null = inherit the item default
  updated_at timestamptz not null default now(),
  primary key (salon_id, item_id)
);

create trigger trg_sps_updated before update on public.salon_product_stock
for each row execute function public.set_updated_at();

-- Backfill current stock into Ilorin.
insert into public.salon_product_stock
  (salon_id, item_id, quantity_on_hand, quantity_reserved)
select '77770001-0000-0000-0000-000000000001', id,
       quantity_on_hand, quantity_reserved
from public.inventory_items;

alter table public.inventory_movements
  add column salon_id uuid references public.salons (id);
update public.inventory_movements
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.inventory_movements alter column salon_id set not null;
create index idx_inv_mv_salon on public.inventory_movements (salon_id, created_at desc);

alter table public.stock_receipts
  add column salon_id uuid references public.salons (id);
update public.stock_receipts
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.stock_receipts alter column salon_id set not null;

alter table public.stock_counts
  add column salon_id uuid references public.salons (id);
update public.stock_counts
  set salon_id = '77770001-0000-0000-0000-000000000001';
alter table public.stock_counts alter column salon_id set not null;

-- appointment_inventory_usage carries no salon_id: it derives it from its
-- appointment, which is now salon-scoped.

-- --------------------------------------------------------------- expenses ---
-- Nullable by design: null = brand-level expense (rent for HQ, software).
alter table public.expenses
  add column salon_id uuid references public.salons (id);
update public.expenses
  set salon_id = '77770001-0000-0000-0000-000000000001';

alter table public.recurring_expense_templates
  add column salon_id uuid references public.salons (id);
update public.recurring_expense_templates
  set salon_id = '77770001-0000-0000-0000-000000000001';

-- Recurring generation now copies the template's salon onto generated
-- drafts — otherwise identical to the 0015 version.
create or replace function public.fn_generate_recurring_expenses()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_count integer := 0;
  v_admin uuid;
  t record;
begin
  select id into v_admin from public.profiles where role = 'admin'
    order by created_at limit 1;

  for t in select * from public.recurring_expense_templates
           where is_active and auto_create_draft and next_due_date <= v_today
             and (end_date is null or next_due_date <= end_date)
           for update loop
    -- Duplicate guard: one instance per template per due date.
    if not exists (select 1 from public.expenses
                   where recurring_template_id = t.id
                     and expense_date = t.next_due_date) then
      insert into public.expenses
        (organisation_id, expense_date, amount_kobo, category_id, description,
         payee, payment_method, recurring_template_id, salon_id, status,
         entered_by, notes)
      values ((select id from public.organisations limit 1), t.next_due_date,
              t.amount_kobo, t.category_id, t.description, t.vendor,
              t.payment_method, t.id, t.salon_id, 'draft',
              coalesce(v_admin, t.id),
              'Auto-created from recurring template');
      v_count := v_count + 1;
    end if;

    update public.recurring_expense_templates
       set next_due_date = case t.frequency
         when 'weekly' then t.next_due_date + 7
         when 'monthly' then (t.next_due_date + interval '1 month')::date
         when 'quarterly' then (t.next_due_date + interval '3 months')::date
         else (t.next_due_date + interval '1 year')::date end
     where id = t.id;
  end loop;
  return v_count;
end $$;
