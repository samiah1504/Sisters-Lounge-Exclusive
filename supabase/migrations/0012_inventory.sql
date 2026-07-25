-- 0012 Inventory foundation: units, categories, suppliers, items, settings.
-- Quantities are numeric(12,3) so ml/g measures work. Money stays kobo.

create table public.inventory_units (
  code text primary key check (code ~ '^[a-z0-9-]+$'),
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.inventory_units (code, label) values
  ('piece', 'Piece'), ('pack', 'Pack'), ('bottle', 'Bottle'), ('jar', 'Jar'),
  ('tube', 'Tube'), ('sachet', 'Sachet'), ('box', 'Box'), ('ml', 'Millilitre'),
  ('l', 'Litre'), ('g', 'Gram'), ('kg', 'Kilogram'), ('set', 'Set'), ('roll', 'Roll'),
  ('pair', 'Pair');

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_inv_categories_updated before update on public.inventory_categories
for each row execute function public.set_updated_at();

insert into public.inventory_categories (name, slug, display_order) values
  ('Shampoo', 'shampoo', 1), ('Conditioner', 'conditioner', 2),
  ('Treatments', 'treatments', 3), ('Hair Colouring', 'hair-colouring', 4),
  ('Henna', 'henna', 5), ('Beads and Accessories', 'beads-accessories', 6),
  ('Nail Products', 'nail-products', 7), ('Disposable Supplies', 'disposable-supplies', 8),
  ('Cleaning Supplies', 'cleaning-supplies', 9), ('Retail Hair Products', 'retail-hair-products', 10),
  ('Salon Equipment', 'salon-equipment', 11), ('Towels and Linen', 'towels-linen', 12),
  ('Home-Service Supplies', 'home-service-supplies', 13);

-- ---------------------------------------------------------------- suppliers --
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  whatsapp_number text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  categories_supplied text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_suppliers_updated before update on public.suppliers
for each row execute function public.set_updated_at();

-- Bank details live apart so ordinary staff never see them (RLS in 0016).
create table public.supplier_bank_details (
  supplier_id uuid primary key references public.suppliers (id) on delete cascade,
  bank_details text not null default '',
  updated_at timestamptz not null default now()
);

create trigger trg_supplier_bank_updated before update on public.supplier_bank_details
for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------- items --
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  sku text not null unique,
  barcode text,
  item_type text not null check (item_type in ('consumable', 'retail', 'equipment')),
  category_id uuid references public.inventory_categories (id),
  unit text not null references public.inventory_units (code),
  quantity_on_hand numeric(12,3) not null default 0,
  quantity_reserved numeric(12,3) not null default 0,
  quantity_available numeric(12,3) generated always as
    (quantity_on_hand - quantity_reserved) stored,
  reorder_level numeric(12,3) not null default 0,
  reorder_quantity numeric(12,3) not null default 0,
  cost_price_kobo bigint not null default 0 check (cost_price_kobo >= 0),
  selling_price_kobo bigint check (selling_price_kobo >= 0),
  supplier_id uuid references public.suppliers (id),
  storage_location text not null default '',
  batch_number text,
  expiry_date date,
  is_active boolean not null default true,
  retail_available boolean not null default false,
  salon_use_available boolean not null default true,
  image_url text,
  description text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index idx_inv_items_type on public.inventory_items (item_type);
create index idx_inv_items_category on public.inventory_items (category_id);
create index idx_inv_items_supplier on public.inventory_items (supplier_id);

create trigger trg_inv_items_updated before update on public.inventory_items
for each row execute function public.set_updated_at();

-- Quantities may ONLY change through fn_post_stock_movement (sets the GUC).
create or replace function public.guard_inventory_quantities()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.quantity_on_hand is distinct from old.quantity_on_hand
      or new.quantity_reserved is distinct from old.quantity_reserved)
     and coalesce(current_setting('app.stock_internal', true), '') <> 'on' then
    raise exception 'STOCK_GUARD: quantities change only through stock movements';
  end if;
  return new;
end $$;

create trigger trg_inv_items_qty_guard before update on public.inventory_items
for each row execute function public.guard_inventory_quantities();

-- Link retail products to inventory (single source of stock truth).
alter table public.products
  add column inventory_item_id uuid references public.inventory_items (id);

-- ---------------------------------------------------------------- settings --
create table public.inventory_settings (
  id boolean primary key default true check (id),
  expiry_warning_days integer not null default 30 check (expiry_warning_days between 1 and 365),
  allow_negative_stock boolean not null default false,
  high_value_adjustment_kobo bigint not null default 5000000, -- ₦50,000
  alert_recipients text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger trg_inv_settings_updated before update on public.inventory_settings
for each row execute function public.set_updated_at();

insert into public.inventory_settings (id) values (true);
