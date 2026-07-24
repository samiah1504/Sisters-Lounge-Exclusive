# Roles & Permissions

## Roles

| Role | Description |
| ---- | ----------- |
| `customer` | Default for every sign-up. Owner-only data access via RLS. |
| `staff` | Salon stylists/front desk. Operational permissions below. |
| `admin` | Full access — `has_permission()` returns true for every key. |

Role changes are admin-only (enforced by a trigger on `profiles`, not just UI).

## Permission keys

| Key | Staff | Admin | Used by |
| --- | :---: | :---: | ------- |
| `plans.view` / `plans.manage` | – | ✓ | plan admin, RLS on plans |
| `categories.view` / `categories.manage` | – | ✓ | category admin |
| `services.view` / `services.manage` | – | ✓ | service admin |
| `extra_services.view` / `extra_services.manage` | – | ✓ | add-on admin |
| `subscriptions.view` | ✓ | ✓ | customer/subscription views |
| `subscriptions.manage` | – | ✓ | `fn_activate_manual_subscription` |
| `subscriptions.adjust_visits` | – | ✓ | `fn_adjust_visit_balance` |
| `appointments.view` | ✓ | ✓ | booking lists/detail, histories, internal notes read |
| `appointments.create` | – | ✓ | booking on behalf of customers |
| `appointments.update` | ✓ | ✓ | status transitions, reschedule override |
| `appointments.assign` | ✓ | ✓ | `fn_assign_stylist` |
| `appointments.complete` | ✓ | ✓ | `fn_complete_appointment` |
| `appointments.cancel` | – | ✓ | `fn_release_appointment` (staff can via `appointments.update`) |
| `consultations.view` | ✓ | ✓ | consultation requests |
| `consultations.manage` | – | ✓ | type management, status changes |
| `products.view` / `products.manage` | – | ✓ | product admin |
| `retention.view` | ✓ | ✓ | retention dashboards |
| `retention.manage` | – | ✓ | prompt insert/delete |
| `recommendations.view` / `recommendations.manage` | – | ✓ | rule admin |
| `customers.view` | ✓ | ✓ | customer search/detail |
| `customers.manage` | – | ✓ | profile edits, archive |
| `customers.internal_notes` | – | ✓ | internal note read/write |
| `customers.tags.manage` | – | ✓ | tags |

Staff grants live in `role_permissions` (seeded in `0001_foundation.sql`) and
can be changed at runtime by admins without code changes.

## What customers can NEVER do (RLS + triggers + function guards)

- Assign themselves an active plan, add visits, or modify entitlements
- Choose or assign a stylist
- Change booking completion status or any appointment state directly
- Modify prices, plan rules or another customer's data
- Read internal notes, audit logs or other customers' records
- Edit their own role, account status or retention prompt content
