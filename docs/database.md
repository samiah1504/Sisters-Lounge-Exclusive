# Database Reference

Migrations live in `supabase/migrations/` and apply in filename order.
Money = integer kobo. Timestamps = `timestamptz`. IDs = UUID. Soft
deletion (`archived_at`) everywhere history matters — historical records are
never hard-deleted.

## Migration map

| File | Contents |
| ---- | -------- |
| `0001_foundation.sql` | extensions, `set_updated_at`, `profiles` (+role guard trigger), `permissions`, `role_permissions`, `has_permission()`, `audit_log`, `write_audit()` |
| `0002_customers_children.sql` | `customer_profiles` (+status guard), auto-provisioning triggers, `is_profile_booking_ready()`, `children`, `customer_tags`, `customer_tag_assignments`, `customer_internal_notes` |
| `0003_catalogue.sql` | `organisations`, `subscription_categories`, `services`, `subscription_plans`, `subscription_plan_versions` (+snapshot trigger), `subscription_plan_services`, `extra_service_categories`, `extra_services`, plan/customer eligibility tables, `is_extra_service_eligible()` |
| `0004_subscriptions.sql` | `pending_plan_selections`, `subscriptions`, `subscription_status_history` (+trigger), `subscription_cycles`, `visit_entitlements`, `visit_reservations`, `pending_payment_intents` |
| `0005_scheduling.sql` | `business_hours` (7 rows), `scheduling_settings` (single row), `blackout_dates`, `staff_working_hours`, `staff_time_off`, `stylist_skills` |
| `0006_appointments.sql` | `appointments` (+status history trigger, stylist exclusion constraint), `appointment_extra_services`, `appointment_status_history`, `appointment_reschedule_history`, `stylist_assignment_history`, `appointment_internal_notes` |
| `0007_consultations_products.sql` | `consultation_types`, `consultation_bookings`, `product_categories`, `products`, `favourites` (generic) |
| `0008_recommendations_retention.sql` | `recommendation_rules`, `recommendation_targets`, `recommendation_items`, `retention_prompts` (+customer update guard) |
| `0009_business_functions.sql` | all lifecycle functions (below) |
| `0010_retention_availability.sql` | `fn_generate_retention_prompts`, `fn_get_available_slots` |
| `0011_rls.sql` | RLS enablement + every policy |

## Status vocabularies

- **Subscriptions**: draft, pending_payment, active, expiring_soon,
  renewal_due, payment_failed, expired, opted_out, suspended,
  cancelled_by_admin, archived
- **Appointments**: draft, pending_addon_payment, pending_confirmation,
  confirmed, assigned, arrived, in_service, completed, rescheduled, missed,
  cancelled_salon, cancelled_admin, no_longer_eligible, expired
- **Entitlements**: available, reserved, consumed, expired, revoked
- **Plans**: draft, active, hidden, closed, archived

## Lifecycle functions (SECURITY DEFINER)

| Function | Caller | Effect |
| -------- | ------ | ------ |
| `fn_select_plan(plan, child?)` | customer | supersedes prior selection, creates pending selection + payment intent |
| `fn_cancel_pending_selection(id)` | customer | cancels selection + intent |
| `fn_activate_manual_subscription(customer, plan, child?, start?, reason)` | admin (`subscriptions.manage`) | creates active subscription + cycle + entitlements; resolves pending selection; audited |
| `fn_book_appointment(sub, service, starts_at, location, child?, extras[], notes)` | customer/staff | ~20 validations, reserves earliest entitlement, snapshots add-on prices, creates payment intent for prepaid add-ons |
| `fn_reschedule_appointment(appt, new_starts_at, reason)` | customer/staff | deadline+cycle+interval+capacity checks; history row; reservation preserved; customer version resets to pending_confirmation |
| `fn_complete_appointment(appt)` | staff (`appointments.complete`) | consumes the visit exactly once (`ALREADY_COMPLETED` guard) |
| `fn_release_appointment(appt, status, reason)` | staff | missed/cancel paths; releases reservation → visit returns while cycle active |
| `fn_assign_stylist(appt, stylist, reason)` | staff (`appointments.assign`) | skill check, active-staff check, assignment history; overlap blocked by constraint |
| `fn_set_appointment_status(appt, status, reason)` | staff | confirmed/arrived/in_service transitions with state validation |
| `fn_adjust_visit_balance(cycle, delta, reason)` | admin (`subscriptions.adjust_visits`) | reason REQUIRED; adds/revokes entitlements; audited |
| `fn_expire_cycles()` | cron/admin | expires ended cycles, their entitlements/reservations and subscriptions |
| `fn_set_renewal_opt_out(sub, bool)` | customer | opt out of next renewal only — never cancels a paid cycle |
| `fn_generate_retention_prompts(customer)` | app (on dashboard load) | idempotent upsert of `auto:*` prompts; removes stale; keeps dismissals |
| `fn_get_available_slots(date, location, duration)` | app | valid start times from hours/settings/blackouts/capacity — nothing hardcoded |

## RLS summary

- Customers: owner-only on their profile, children, subscriptions, cycles,
  entitlements, reservations (read-only), appointments, selections,
  favourites, consultation bookings, retention prompts (seen/dismiss only —
  trigger-enforced).
- Public/anon: active+public catalogue rows only (categories, plans,
  services, extras, products, consultation types, hours).
- Staff/admin: permission-gated via `has_permission()`; internal notes and
  audit log are staff/admin-only.
- **No direct INSERT/UPDATE policies** exist for appointments, entitlements
  or reservations — the definer functions are the only write path.

## Local verification

`scripts/db/auth-shim.sql` emulates `auth.users`, `auth.uid()` and the
anon/authenticated/service_role roles on plain Postgres so the entire
migration set + RLS runs and is tested locally (`npm run db:reset`).
Never run the shim against real Supabase.
