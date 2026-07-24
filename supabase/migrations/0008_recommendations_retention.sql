-- 0008 Rule-based recommendations and retention prompts. No AI, no external
-- messaging — in-app only.

create table public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  context text not null
    check (context in ('plan_detail', 'booking', 'booking_confirmation',
                       'upcoming_appointment', 'post_appointment', 'product_catalogue')),
  badge_label text, -- e.g. 'Customers often add' / 'Recommended for this visit'
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_reco_rules_updated before update on public.recommendation_rules
for each row execute function public.set_updated_at();

-- What the rule applies to. target_type 'all' matches everything in context.
create table public.recommendation_targets (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.recommendation_rules (id) on delete cascade,
  target_type text not null check (target_type in ('plan', 'service', 'category', 'all')),
  target_id uuid,
  check (target_type = 'all' or target_id is not null)
);

create index idx_reco_targets_rule on public.recommendation_targets (rule_id);

-- What the rule recommends.
create table public.recommendation_items (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.recommendation_rules (id) on delete cascade,
  item_type text not null check (item_type in ('extra_service', 'product')),
  item_id uuid not null,
  display_order integer not null default 0
);

create index idx_reco_items_rule on public.recommendation_items (rule_id);

-- ---------------------------------------------------------- retention prompts --
-- prompt_key deduplicates: regenerating the same condition upserts instead of
-- stacking duplicates (e.g. 'visits_expiring:<cycle_id>').
create table public.retention_prompts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  prompt_key text not null,
  prompt_type text not null default 'info'
    check (prompt_type in ('info', 'action_required', 'urgent', 'success', 're_engagement')),
  title text not null,
  message text not null,
  priority integer not null default 0,
  action_label text,
  action_url text,
  starts_on date not null default current_date,
  expires_on date,
  dismissible boolean not null default true,
  dismissed_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, prompt_key)
);

create index idx_retention_customer on public.retention_prompts (customer_id)
  where dismissed_at is null;

create trigger trg_retention_updated before update on public.retention_prompts
for each row execute function public.set_updated_at();

-- Customers may only mark prompts seen/dismissed — nothing else.
create or replace function public.guard_retention_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Internal generation (definer functions) and service contexts are exempt.
  if coalesce(current_setting('app.retention_internal', true), '') = 'on'
     or auth.uid() is null then
    return new;
  end if;
  if not public.is_staff_or_admin() then
    if new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.prompt_type is distinct from old.prompt_type
       or new.priority is distinct from old.priority
       or new.action_label is distinct from old.action_label
       or new.action_url is distinct from old.action_url
       or new.starts_on is distinct from old.starts_on
       or new.expires_on is distinct from old.expires_on
       or new.dismissible is distinct from old.dismissible
       or new.customer_id is distinct from old.customer_id
       or new.prompt_key is distinct from old.prompt_key then
      raise exception 'customers may only update seen/dismissed state';
    end if;
    if new.dismissed_at is not null and not old.dismissible then
      raise exception 'this prompt cannot be dismissed';
    end if;
  end if;
  return new;
end $$;

create trigger trg_retention_guard before update on public.retention_prompts
for each row execute function public.guard_retention_update();
