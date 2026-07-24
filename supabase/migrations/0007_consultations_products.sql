-- 0007 Consultation catalogue + bookings, product catalogue, favourites.

create table public.consultation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  short_description text not null default '',
  full_description text not null default '',
  price_kobo bigint not null check (price_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  duration_minutes integer not null default 30 check (duration_minutes between 10 and 240),
  location_type text not null default 'salon'
    check (location_type in ('salon', 'home', 'virtual')),
  subscriber_only boolean not null default false,
  non_subscriber_available boolean not null default true,
  subscriber_discount_kobo bigint not null default 0 check (subscriber_discount_kobo >= 0),
  available_days integer[] not null default '{1,2,3,4,5,6}',
  is_active boolean not null default true,
  image_url text,
  questionnaire jsonb not null default '[]'::jsonb, -- [{key,label,type,required}]
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger trg_consultation_types_updated before update on public.consultation_types
for each row execute function public.set_updated_at();

create table public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  child_id uuid references public.children (id),
  consultation_type_id uuid not null references public.consultation_types (id),
  requested_at timestamptz not null, -- requested date/time
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_confirmation', 'confirmed',
                      'completed', 'cancelled', 'expired')),
  concerns text not null default '',
  answers jsonb not null default '{}'::jsonb,
  photo_paths jsonb not null default '[]'::jsonb,
  price_kobo bigint not null default 0, -- snapshot incl. subscriber discount
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_consult_bookings_customer on public.consultation_bookings (customer_id);

create trigger trg_consult_bookings_updated before update on public.consultation_bookings
for each row execute function public.set_updated_at();

alter table public.pending_payment_intents
  add constraint fk_intent_consultation
  foreign key (consultation_booking_id)
  references public.consultation_bookings (id) on delete set null;

-- ---------------------------------------------------------------- products --
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  sku text not null unique,
  short_description text not null default '',
  full_description text not null default '',
  category_id uuid references public.product_categories (id),
  price_kobo bigint not null check (price_kobo >= 0),
  subscriber_price_kobo bigint check (subscriber_price_kobo >= 0),
  images jsonb not null default '[]'::jsonb,
  stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  age_suitability text not null default 'all'
    check (age_suitability in ('all', 'adults', 'children')),
  hair_type_suitability text not null default '',
  usage_instructions text not null default '',
  ingredients text not null default '',
  warnings text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index idx_products_category on public.products (category_id);

create trigger trg_products_updated before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------- generic favourites --
create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  item_type text not null check (item_type in ('product', 'extra_service', 'consultation_type')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (customer_id, item_type, item_id)
);

create index idx_favourites_customer on public.favourites (customer_id);
