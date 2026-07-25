-- 0014 Equipment register: assets and maintenance/repair/audit logs.
-- Equipment never loses quantity through appointment consumption.

create table public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asset_code text not null unique,
  category_id uuid references public.inventory_categories (id),
  purchase_date date,
  purchase_cost_kobo bigint not null default 0 check (purchase_cost_kobo >= 0),
  supplier_id uuid references public.suppliers (id),
  condition text not null default 'good'
    check (condition in ('new', 'good', 'fair', 'needs_repair', 'under_repair',
                         'damaged', 'retired')),
  location text not null default 'salon',
  assigned_staff_id uuid references public.profiles (id),
  warranty_expiry date,
  maintenance_interval_days integer check (maintenance_interval_days > 0),
  last_maintenance_date date,
  next_maintenance_date date,
  notes text not null default '',
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_equipment_updated before update on public.equipment_assets
for each row execute function public.set_updated_at();

create table public.equipment_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets (id) on delete cascade,
  log_type text not null
    check (log_type in ('maintenance', 'repair', 'condition_change',
                        'assignment', 'retirement', 'note')),
  description text not null,
  cost_kobo bigint not null default 0 check (cost_kobo >= 0),
  previous_condition text,
  new_condition text,
  performed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index idx_equipment_logs_asset on public.equipment_logs (asset_id, created_at desc);

-- Log condition changes and retirement automatically (audit history).
create or replace function public.log_equipment_condition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.condition is distinct from old.condition then
    insert into public.equipment_logs
      (asset_id, log_type, description, previous_condition, new_condition, performed_by)
    values (new.id,
            case when new.condition = 'retired' then 'retirement' else 'condition_change' end,
            'Condition changed from ' || old.condition || ' to ' || new.condition,
            old.condition, new.condition, auth.uid());
    if new.condition = 'retired' then
      new.is_active := false;
      new.assigned_staff_id := null; -- retiring un-assigns automatically
    end if;
  end if;
  if new.last_maintenance_date is distinct from old.last_maintenance_date
     and new.maintenance_interval_days is not null then
    new.next_maintenance_date :=
      new.last_maintenance_date + new.maintenance_interval_days;
  end if;
  return new;
end $$;

create trigger trg_equipment_condition before update on public.equipment_assets
for each row execute function public.log_equipment_condition();
