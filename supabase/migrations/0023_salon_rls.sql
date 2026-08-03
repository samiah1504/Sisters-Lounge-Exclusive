-- ============================================================================
-- 0023 — SALON-SCOPED RLS + JWT CLAIMS (v3 §4.6, §10)
-- Staff roles are scoped to their assigned salons, enforced in RLS via
-- salon ids in the JWT (custom access token hook) with a live fallback to
-- staff_salon_assignments, so scoping is correct even before the hook is
-- enabled in the Supabase dashboard (manual step). Admins are unscoped.
-- ============================================================================

-- ------------------------------------------------------------- permissions --
insert into public.permissions (key, description) values
  ('salons.view', 'View salon details and settings'),
  ('salons.manage', 'Create, edit, pause and close salons');

insert into public.role_permissions (role, permission_key) values
  ('staff', 'salons.view');

-- ------------------------------------------------------------ JWT helpers ---
-- Salon ids for the current staff user: prefer the JWT claim (set by the
-- auth hook), fall back to the assignments table.
create function public.jwt_salon_ids()
returns uuid[] language plpgsql stable security definer
set search_path = public as $$
declare
  v_claim jsonb;
  v_ids uuid[];
begin
  v_claim := nullif(current_setting('request.jwt.claims', true), '')::jsonb
             -> 'salon_ids';
  if v_claim is not null and jsonb_typeof(v_claim) = 'array' then
    select coalesce(array_agg(value::uuid), '{}') into v_ids
    from jsonb_array_elements_text(v_claim);
    return v_ids;
  end if;
  select coalesce(array_agg(salon_id), '{}') into v_ids
  from public.staff_salon_assignments where profile_id = auth.uid();
  return v_ids;
end $$;

-- True when the current user may act for this salon (admins everywhere).
create function public.is_salon_staff(p_salon_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select public.is_admin() or p_salon_id = any (public.jwt_salon_ids())
$$;

-- Supabase custom access token hook: injects salon_ids into every staff
-- JWT. MANUAL STEP: enable under Authentication → Hooks in the dashboard.
create function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = public as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  sids jsonb;
begin
  select coalesce(jsonb_agg(salon_id), '[]'::jsonb) into sids
  from public.staff_salon_assignments
  where profile_id = (event ->> 'user_id')::uuid;
  return jsonb_set(event, '{claims}', jsonb_set(claims, '{salon_ids}', sids));
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.custom_access_token_hook to supabase_auth_admin;
    grant select on public.staff_salon_assignments to supabase_auth_admin;
  end if;
end $$;

-- ------------------------------------------------------- new-table policies --
alter table public.salons enable row level security;
alter table public.salon_hours enable row level security;
alter table public.salon_blackout_dates enable row level security;
alter table public.salon_settings enable row level security;
alter table public.staff_salon_assignments enable row level security;
alter table public.city_waitlist enable row level security;
alter table public.salon_product_stock enable row level security;

-- The public Salons page markets open salons AND coming-soon cities.
create policy salons_public_read on public.salons
  for select using (status in ('open', 'waitlist', 'planned')
                    or public.is_staff_or_admin());
create policy salons_manage on public.salons
  for all using (public.has_permission('salons.manage'));

create policy salon_hours_read on public.salon_hours
  for select using (true);
create policy salon_hours_manage on public.salon_hours
  for all using (public.has_permission('salons.manage'));

create policy salon_blackouts_read on public.salon_blackout_dates
  for select using (public.is_staff_or_admin());
create policy salon_blackouts_manage on public.salon_blackout_dates
  for all using (public.has_permission('salons.manage'));

create policy salon_settings_read on public.salon_settings
  for select using (public.is_staff_or_admin());
create policy salon_settings_manage on public.salon_settings
  for all using (public.has_permission('salons.manage'));

create policy ssa_self_read on public.staff_salon_assignments
  for select using (profile_id = auth.uid() or public.is_staff_or_admin());
create policy ssa_admin_manage on public.staff_salon_assignments
  for all using (public.is_admin());

-- Anyone may join a city waitlist; only admins read or manage it.
create policy waitlist_public_insert on public.city_waitlist
  for insert with check (length(trim(contact)) > 3);
create policy waitlist_admin_read on public.city_waitlist
  for select using (public.is_admin());
create policy waitlist_admin_delete on public.city_waitlist
  for delete using (public.is_admin());

-- Stock is visible to inventory-permitted staff of that salon only.
-- No insert/update policies: the ledger functions are the only write path.
create policy sps_read on public.salon_product_stock
  for select using (public.has_permission('inventory.view')
                    and public.is_salon_staff(salon_id));

-- --------------------------------------- salon scoping on existing tables ---
-- Staff see and work their own salons; admins are unscoped. Members' own
-- reads are untouched.

drop policy appointments_own_read on public.appointments;
create policy appointments_own_read on public.appointments
  for select using (
    customer_id = public.current_customer_id()
    or stylist_profile_id = auth.uid()
    or (public.has_permission('appointments.view')
        and public.is_salon_staff(salon_id)));

drop policy staff_hours_staff on public.staff_working_hours;
create policy staff_hours_staff on public.staff_working_hours
  for select using (staff_profile_id = auth.uid()
                    or (public.is_staff_or_admin()
                        and public.is_salon_staff(salon_id)));

drop policy time_off_staff on public.staff_time_off;
create policy time_off_staff on public.staff_time_off
  for select using (staff_profile_id = auth.uid()
                    or (public.is_staff_or_admin()
                        and public.is_salon_staff(salon_id)));

drop policy inv_movements_read on public.inventory_movements;
create policy inv_movements_read on public.inventory_movements
  for select using (public.has_permission('inventory.view')
                    and public.is_salon_staff(salon_id));

drop policy receipts_read on public.stock_receipts;
create policy receipts_read on public.stock_receipts
  for select using (public.has_permission('inventory.view')
                    and public.is_salon_staff(salon_id));
drop policy receipts_write on public.stock_receipts;
create policy receipts_write on public.stock_receipts
  for insert with check (public.has_permission('inventory.receive')
                         and public.is_salon_staff(salon_id));
drop policy receipts_update on public.stock_receipts;
create policy receipts_update on public.stock_receipts
  for update using (public.has_permission('inventory.receive')
                    and public.is_salon_staff(salon_id));

drop policy counts_read on public.stock_counts;
create policy counts_read on public.stock_counts
  for select using (public.has_permission('inventory.view')
                    and public.is_salon_staff(salon_id));
drop policy counts_write on public.stock_counts;
create policy counts_write on public.stock_counts
  for insert with check (public.has_permission('inventory.count')
                         and public.is_salon_staff(salon_id));
drop policy counts_update on public.stock_counts;
create policy counts_update on public.stock_counts
  for update using (public.has_permission('inventory.count')
                    and public.is_salon_staff(salon_id));

drop policy expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select using (public.has_permission('expenses.view')
                    and (salon_id is null and public.is_admin()
                         or public.is_salon_staff(salon_id)));

-- ------------------------------------- visiting-member access rule (§10) ----
-- Staff may view a member's profile ONLY where that member has a visit at
-- one of the staff member's salons — a policy, not a UI convention.
-- Admins are unscoped. Members' own access is unchanged.

drop policy customer_profiles_own on public.customer_profiles;
create policy customer_profiles_own on public.customer_profiles
  for select using (
    profile_id = auth.uid()
    or (public.has_permission('customers.view')
        and (public.is_admin()
             or exists (select 1 from public.appointments a
                        where a.customer_id = customer_profiles.id
                          and a.salon_id = any (public.jwt_salon_ids())))));

drop policy children_owner_all on public.children;
create policy children_owner_all on public.children
  for all using (
    customer_id = public.current_customer_id()
    or (public.has_permission('customers.view')
        and (public.is_admin()
             or exists (select 1 from public.appointments a
                        where a.customer_id = children.customer_id
                          and a.salon_id = any (public.jwt_salon_ids())))))
  with check (
    customer_id = public.current_customer_id()
    or public.has_permission('customers.manage')
  );
