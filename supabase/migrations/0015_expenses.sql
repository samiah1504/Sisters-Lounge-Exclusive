-- 0015 Expenses: categories, expense workflow, recurring templates, settings.
-- Approved expenses are never deleted — corrections happen by voiding.

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

insert into public.expense_categories (name, display_order) values
  ('Inventory Purchases', 1), ('Staff Salaries', 2), ('Rent', 3),
  ('Electricity', 4), ('Fuel', 5), ('Generator Maintenance', 6),
  ('Internet', 7), ('Water', 8), ('Cleaning', 9),
  ('Repairs and Maintenance', 10), ('Marketing', 11), ('Transportation', 12),
  ('Home-Service Logistics', 13), ('Refreshments', 14),
  ('Software Subscriptions', 15), ('Bank Charges', 16),
  ('Payment Processing Charges', 17), ('Refunds', 18),
  ('Equipment Purchases', 19), ('Miscellaneous', 20);

create table public.expense_settings (
  id boolean primary key default true check (id),
  approval_threshold_kobo bigint not null default 10000000, -- ₦100,000 → admin approval
  updated_at timestamptz not null default now()
);

create trigger trg_expense_settings_updated before update on public.expense_settings
for each row execute function public.set_updated_at();

insert into public.expense_settings (id) values (true);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  expense_date date not null default current_date,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  category_id uuid not null references public.expense_categories (id),
  subcategory text not null default '',
  description text not null,
  payee text not null default '',
  payment_method text not null default 'transfer'
    check (payment_method in ('cash', 'transfer', 'card', 'pos', 'other')),
  location text not null default 'salon',
  supplier_id uuid references public.suppliers (id),
  stock_receipt_id uuid references public.stock_receipts (id),
  appointment_id uuid references public.appointments (id),
  receipt_url text,
  reference_number text not null default '',
  recurring_template_id uuid, -- FK added below after template table
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'rejected',
                      'paid', 'voided')),
  entered_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);

create index idx_expenses_status on public.expenses (status);
create index idx_expenses_date on public.expenses (expense_date desc);
create index idx_expenses_category on public.expenses (category_id);

create trigger trg_expenses_updated before update on public.expenses
for each row execute function public.set_updated_at();

-- Submitted+ expenses cannot be silently edited or deleted.
create or replace function public.guard_expense_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'EXPENSE_LOCKED: only draft expenses can be deleted — void instead';
    end if;
    return old;
  end if;
  if old.status not in ('draft')
     and coalesce(current_setting('app.expense_internal', true), '') <> 'on' then
    raise exception 'EXPENSE_LOCKED: submitted expenses change only through the approval workflow';
  end if;
  return new;
end $$;

create trigger trg_expense_guard before update or delete on public.expenses
for each row execute function public.guard_expense_changes();

-- ------------------------------------------------------------ workflow fns --
create or replace function public.fn_expense_transition(
  p_expense_id uuid, p_action text, p_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_exp public.expenses;
  v_settings public.expense_settings;
begin
  select * into v_exp from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'expense not found'; end if;
  select * into v_settings from public.expense_settings limit 1;

  perform set_config('app.expense_internal', 'on', true);

  if p_action = 'submit' then
    if not public.has_permission('expenses.submit') then
      raise exception 'permission denied: expenses.submit';
    end if;
    if v_exp.status <> 'draft' then raise exception 'STATE: only drafts can be submitted'; end if;
    update public.expenses set status = 'pending_approval' where id = p_expense_id;

  elsif p_action in ('approve', 'reject') then
    if not public.has_permission('expenses.' || p_action) then
      raise exception 'permission denied: expenses.%', p_action;
    end if;
    if v_exp.status <> 'pending_approval' then
      raise exception 'STATE: expense is not awaiting approval';
    end if;
    -- Creators never approve their own expenses (admins included).
    if p_action = 'approve' and v_exp.entered_by = auth.uid() then
      raise exception 'SELF_APPROVAL: you cannot approve your own expense';
    end if;
    -- High-value approvals are admin-only.
    if p_action = 'approve'
       and v_exp.amount_kobo >= v_settings.approval_threshold_kobo
       and not public.is_admin() then
      raise exception 'THRESHOLD: expenses of this size need admin approval';
    end if;
    update public.expenses
       set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
           approved_by = auth.uid(), approved_at = now(),
           notes = case when p_reason <> '' then notes ||
             case when notes = '' then '' else E'\n' end ||
             p_action || ': ' || p_reason else notes end
     where id = p_expense_id;

  elsif p_action = 'mark_paid' then
    if not public.has_permission('expenses.mark_paid') then
      raise exception 'permission denied: expenses.mark_paid';
    end if;
    if v_exp.status <> 'approved' then
      raise exception 'STATE: only approved expenses can be marked paid';
    end if;
    update public.expenses set status = 'paid', paid_at = now() where id = p_expense_id;

  elsif p_action = 'void' then
    if not public.has_permission('expenses.void') then
      raise exception 'permission denied: expenses.void';
    end if;
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED: voiding needs a reason';
    end if;
    if v_exp.status in ('voided') then
      raise exception 'STATE: expense is already voided';
    end if;
    update public.expenses
       set status = 'voided', voided_at = now(), void_reason = p_reason
     where id = p_expense_id;

  else
    raise exception 'unknown action %', p_action;
  end if;

  perform set_config('app.expense_internal', '', true);
  perform public.write_audit('expense.' || p_action, 'expense', p_expense_id, p_reason,
    jsonb_build_object('amount_kobo', v_exp.amount_kobo, 'previous_status', v_exp.status));
end $$;

-- ------------------------------------------------------ recurring templates --
create table public.recurring_expense_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories (id),
  description text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date not null default current_date,
  next_due_date date not null,
  end_date date,
  vendor text not null default '',
  payment_method text not null default 'transfer',
  auto_create_draft boolean not null default true,
  reminder_days integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_recurring_templates_updated
before update on public.recurring_expense_templates
for each row execute function public.set_updated_at();

alter table public.expenses
  add constraint fk_expense_recurring
  foreign key (recurring_template_id)
  references public.recurring_expense_templates (id) on delete set null;

-- Cron-callable: create due draft expenses (idempotent per due date).
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
         payee, payment_method, recurring_template_id, status, entered_by, notes)
      values ((select id from public.organisations limit 1), t.next_due_date,
              t.amount_kobo, t.category_id, t.description, t.vendor,
              t.payment_method, t.id, 'draft', coalesce(v_admin, t.id),
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
