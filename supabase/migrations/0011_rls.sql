-- 0011 Row Level Security. Customers: owner-only. Public: active catalogue
-- rows only. Staff/admin: permission-gated. Entitlements, reservations and
-- appointment lifecycle writes happen ONLY through SECURITY DEFINER
-- functions — there are deliberately no direct-write policies for them.

-- ------------------------------------------------------------------ enable --
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.children enable row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tag_assignments enable row level security;
alter table public.customer_internal_notes enable row level security;
alter table public.organisations enable row level security;
alter table public.subscription_categories enable row level security;
alter table public.services enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_versions enable row level security;
alter table public.subscription_plan_services enable row level security;
alter table public.extra_service_categories enable row level security;
alter table public.extra_services enable row level security;
alter table public.extra_service_plan_eligibility enable row level security;
alter table public.extra_service_customer_eligibility enable row level security;
alter table public.pending_plan_selections enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_status_history enable row level security;
alter table public.subscription_cycles enable row level security;
alter table public.visit_entitlements enable row level security;
alter table public.visit_reservations enable row level security;
alter table public.pending_payment_intents enable row level security;
alter table public.business_hours enable row level security;
alter table public.scheduling_settings enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.staff_working_hours enable row level security;
alter table public.staff_time_off enable row level security;
alter table public.stylist_skills enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_extra_services enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.appointment_reschedule_history enable row level security;
alter table public.stylist_assignment_history enable row level security;
alter table public.appointment_internal_notes enable row level security;
alter table public.consultation_types enable row level security;
alter table public.consultation_bookings enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.favourites enable row level security;
alter table public.recommendation_rules enable row level security;
alter table public.recommendation_targets enable row level security;
alter table public.recommendation_items enable row level security;
alter table public.retention_prompts enable row level security;

-- ----------------------------------------------------------------- profiles --
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_staff_or_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin());
-- (role/is_active changes are blocked by trg_profiles_guard for non-admins)

-- -------------------------------------------------------------- permissions --
create policy permissions_read on public.permissions
  for select using (public.is_staff_or_admin());
create policy role_permissions_read on public.role_permissions
  for select using (public.is_staff_or_admin());
create policy role_permissions_admin on public.role_permissions
  for all using (public.is_admin());

-- ----------------------------------------------------------------- audit log --
create policy audit_admin_read on public.audit_log
  for select using (public.is_admin());

-- --------------------------------------------------------- customer profiles --
create policy customer_profiles_own on public.customer_profiles
  for select using (profile_id = auth.uid()
                    or public.has_permission('customers.view'));
create policy customer_profiles_update_own on public.customer_profiles
  for update using (profile_id = auth.uid()
                    or public.has_permission('customers.manage'));
-- (status fields guarded by trigger)

-- ------------------------------------------------------------------ children --
create policy children_owner_all on public.children
  for all using (
    customer_id = public.current_customer_id()
    or public.has_permission('customers.view')
  )
  with check (
    customer_id = public.current_customer_id()
    or public.has_permission('customers.manage')
  );

-- --------------------------------------------------------- tags & int. notes --
create policy tags_staff on public.customer_tags
  for select using (public.is_staff_or_admin());
create policy tags_manage on public.customer_tags
  for all using (public.has_permission('customers.tags.manage'));
create policy tag_assignments_staff on public.customer_tag_assignments
  for select using (public.is_staff_or_admin());
create policy tag_assignments_manage on public.customer_tag_assignments
  for all using (public.has_permission('customers.tags.manage'));
create policy internal_notes_access on public.customer_internal_notes
  for all using (public.has_permission('customers.internal_notes'));

-- ------------------------------------------------------------- organisations --
create policy organisations_read on public.organisations for select using (true);

-- ----------------------------------------------------------- catalogue: read --
-- Public (including anonymous) may read active+public rows; managers see all.
create policy categories_public_read on public.subscription_categories
  for select using (
    (is_active and is_public and archived_at is null)
    or public.has_permission('categories.view'));
create policy categories_manage on public.subscription_categories
  for all using (public.has_permission('categories.manage'));

create policy services_public_read on public.services
  for select using (
    (is_active and archived_at is null)
    or public.has_permission('services.view'));
create policy services_manage on public.services
  for all using (public.has_permission('services.manage'));

create policy plans_public_read on public.subscription_plans
  for select using (
    (status = 'active' and is_public and archived_at is null)
    or status = 'closed' and is_public  -- visible but closed to new subscribers
    or public.has_permission('plans.view'));
create policy plans_manage on public.subscription_plans
  for all using (public.has_permission('plans.manage'));

create policy plan_versions_read on public.subscription_plan_versions
  for select using (true); -- snapshots referenced by owned subscriptions
create policy plan_services_read on public.subscription_plan_services
  for select using (true);
create policy plan_services_manage on public.subscription_plan_services
  for all using (public.has_permission('plans.manage'));

create policy extra_categories_read on public.extra_service_categories
  for select using (true);
create policy extra_categories_manage on public.extra_service_categories
  for all using (public.has_permission('extra_services.manage'));

create policy extra_services_public_read on public.extra_services
  for select using (
    (is_active and is_public and archived_at is null)
    or public.has_permission('extra_services.view'));
create policy extra_services_manage on public.extra_services
  for all using (public.has_permission('extra_services.manage'));

create policy extra_plan_elig_read on public.extra_service_plan_eligibility
  for select using (true);
create policy extra_plan_elig_manage on public.extra_service_plan_eligibility
  for all using (public.has_permission('extra_services.manage'));
create policy extra_cust_elig_read on public.extra_service_customer_eligibility
  for select using (true);
create policy extra_cust_elig_manage on public.extra_service_customer_eligibility
  for all using (public.has_permission('extra_services.manage'));

-- ------------------------------------------------------- pending selections --
create policy pending_selections_own_read on public.pending_plan_selections
  for select using (
    customer_id = public.current_customer_id()
    or public.has_permission('subscriptions.view'));
-- writes only via fn_select_plan / fn_cancel_pending_selection

-- -------------------------------------------------------------- subscriptions --
create policy subscriptions_own_read on public.subscriptions
  for select using (
    customer_id = public.current_customer_id()
    or public.has_permission('subscriptions.view'));
create policy sub_history_read on public.subscription_status_history
  for select using (
    exists (select 1 from public.subscriptions s
            where s.id = subscription_id
              and s.customer_id = public.current_customer_id())
    or public.has_permission('subscriptions.view'));
create policy cycles_own_read on public.subscription_cycles
  for select using (
    exists (select 1 from public.subscriptions s
            where s.id = subscription_id
              and s.customer_id = public.current_customer_id())
    or public.has_permission('subscriptions.view'));
create policy entitlements_own_read on public.visit_entitlements
  for select using (
    exists (select 1 from public.subscription_cycles c
            join public.subscriptions s on s.id = c.subscription_id
            where c.id = cycle_id
              and s.customer_id = public.current_customer_id())
    or public.has_permission('subscriptions.view'));
create policy reservations_own_read on public.visit_reservations
  for select using (
    exists (select 1 from public.visit_entitlements e
            join public.subscription_cycles c on c.id = e.cycle_id
            join public.subscriptions s on s.id = c.subscription_id
            where e.id = entitlement_id
              and s.customer_id = public.current_customer_id())
    or public.has_permission('subscriptions.view'));
-- No direct write policies: reserve/consume/release are definer functions.

create policy payment_intents_own_read on public.pending_payment_intents
  for select using (
    customer_id = public.current_customer_id()
    or public.has_permission('subscriptions.view'));

-- ---------------------------------------------------------------- scheduling --
create policy business_hours_read on public.business_hours for select using (true);
create policy business_hours_admin on public.business_hours
  for all using (public.is_admin());
create policy sched_settings_read on public.scheduling_settings for select using (true);
create policy sched_settings_admin on public.scheduling_settings
  for all using (public.is_admin());
create policy blackouts_read on public.blackout_dates for select using (true);
create policy blackouts_admin on public.blackout_dates
  for all using (public.is_admin());
create policy staff_hours_staff on public.staff_working_hours
  for select using (public.is_staff_or_admin());
create policy staff_hours_admin on public.staff_working_hours
  for all using (public.is_admin());
create policy time_off_staff on public.staff_time_off
  for select using (public.is_staff_or_admin());
create policy time_off_admin on public.staff_time_off
  for all using (public.is_admin());
create policy skills_staff_read on public.stylist_skills
  for select using (public.is_staff_or_admin());
create policy skills_admin on public.stylist_skills
  for all using (public.is_admin());

-- -------------------------------------------------------------- appointments --
create policy appointments_own_read on public.appointments
  for select using (
    customer_id = public.current_customer_id()
    or stylist_profile_id = auth.uid()
    or public.has_permission('appointments.view'));
-- No insert/update policies: booking, rescheduling, status changes and
-- assignment run exclusively through definer functions.

create policy appt_extras_read on public.appointment_extra_services
  for select using (
    exists (select 1 from public.appointments a
            where a.id = appointment_id
              and (a.customer_id = public.current_customer_id()
                   or a.stylist_profile_id = auth.uid()))
    or public.has_permission('appointments.view'));

create policy appt_history_read on public.appointment_status_history
  for select using (
    exists (select 1 from public.appointments a
            where a.id = appointment_id
              and a.customer_id = public.current_customer_id())
    or public.has_permission('appointments.view'));

create policy appt_reschedules_read on public.appointment_reschedule_history
  for select using (
    exists (select 1 from public.appointments a
            where a.id = appointment_id
              and a.customer_id = public.current_customer_id())
    or public.has_permission('appointments.view'));

create policy assignment_history_staff on public.stylist_assignment_history
  for select using (public.has_permission('appointments.view'));

-- Internal appointment notes: staff only, NEVER the customer.
create policy appt_internal_notes on public.appointment_internal_notes
  for all using (public.has_permission('appointments.view'))
  with check (public.has_permission('appointments.update'));

-- ------------------------------------------------------------- consultations --
create policy consultation_types_read on public.consultation_types
  for select using (
    (is_active and archived_at is null)
    or public.has_permission('consultations.manage'));
create policy consultation_types_manage on public.consultation_types
  for all using (public.has_permission('consultations.manage'));

create policy consultation_bookings_own on public.consultation_bookings
  for select using (
    customer_id = public.current_customer_id()
    or public.has_permission('consultations.view'));
create policy consultation_bookings_insert on public.consultation_bookings
  for insert with check (customer_id = public.current_customer_id());
create policy consultation_bookings_manage on public.consultation_bookings
  for update using (public.has_permission('consultations.manage'));

-- ------------------------------------------------------------------ products --
create policy product_categories_read on public.product_categories
  for select using (is_active or public.has_permission('products.view'));
create policy product_categories_manage on public.product_categories
  for all using (public.has_permission('products.manage'));
create policy products_public_read on public.products
  for select using (
    (is_active and archived_at is null)
    or public.has_permission('products.view'));
create policy products_manage on public.products
  for all using (public.has_permission('products.manage'));

-- ---------------------------------------------------------------- favourites --
create policy favourites_own on public.favourites
  for all using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

-- ----------------------------------------------------------- recommendations --
create policy reco_rules_read on public.recommendation_rules
  for select using (is_active or public.has_permission('recommendations.view'));
create policy reco_rules_manage on public.recommendation_rules
  for all using (public.has_permission('recommendations.manage'));
create policy reco_targets_read on public.recommendation_targets
  for select using (true);
create policy reco_targets_manage on public.recommendation_targets
  for all using (public.has_permission('recommendations.manage'));
create policy reco_items_read on public.recommendation_items
  for select using (true);
create policy reco_items_manage on public.recommendation_items
  for all using (public.has_permission('recommendations.manage'));

-- ---------------------------------------------------------- retention prompts --
create policy retention_own_read on public.retention_prompts
  for select using (
    customer_id = public.current_customer_id()
    or public.has_permission('retention.view'));
create policy retention_own_update on public.retention_prompts
  for update using (
    customer_id = public.current_customer_id()
    or public.has_permission('retention.manage'));
-- (column restrictions enforced by trg_retention_guard)
create policy retention_manage_insert on public.retention_prompts
  for insert with check (public.has_permission('retention.manage'));
create policy retention_manage_delete on public.retention_prompts
  for delete using (public.has_permission('retention.manage'));
