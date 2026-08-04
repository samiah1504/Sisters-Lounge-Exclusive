# Route Map

## Public (no auth)

| Route | Purpose |
| ----- | ------- |
| `/` | Homepage — positioning, plans preview, how it works, extras, family, consultations, products, CTA |
| `/plans` | Browse active public plans, filter by category |
| `/plans/[slug]` | Plan detail: price, visits, included/excluded services, terms, select CTA |
| `/plans/compare` | Side-by-side comparison table (`?category=` or `?plans=a,b,c`) |
| `/salons` | Open salons + coming-soon cities with per-city waitlist capture |
| `/about`, `/treatments`, `/faq`, `/contact` | Club content (v3 §3.3, §6.4) |
| `/terms`, `/privacy`, `/refund-policy` | Plain-language policies |
| `/login`, `/register` | Auth |

## Customer — `/app` (role: customer)

| Route | Purpose |
| ----- | ------- |
| `/app` | Dashboard: profile completion, plan + visit balance, retention prompts, next appointment, children, quick actions |
| `/app/profile` | Edit profile, contact prefs, service area, notifications, marketing consent |
| `/app/children` | Child list + archived section |
| `/app/children/new`, `/app/children/[id]` | Add / view / edit / archive / restore a child |
| `/app/subscription` | Cycle detail, visit balance, pending selection, renewal opt-out |
| `/app/plans/select/[slug]` | Confirm pending plan selection (self or child) |
| `/app/book` | 6-step booking wizard (recipient → location → service → date/time → ENHANCE YOUR VISIT → review) |
| `/app/appointments` | Upcoming + past |
| `/app/appointments/[id]` | Detail: add-on summary, payment-pending, missed/completed states |
| `/app/appointments/[id]/reschedule` | Reschedule flow (reservation preserved) |
| `/app/consultations`, `/app/consultations/[slug]/book` | Browse + pending consultation booking |
| `/app/products`, `/app/products/[slug]` | Catalogue with search/filter/favourites (no checkout) |
| `/app/favourites` | Saved products, extras, consultations |
| `/app/support` | "Chat with Your Salon Manager" — conversation list, unread badges, WhatsApp fallback |
| `/app/support/new` | Start a conversation (11 topics) |
| `/app/support/[id]` | Chat thread (15s refresh, resolve/reopen); internal notes never appear |

## Admin — `/admin` (role: admin)

| Route | Purpose |
| ----- | ------- |
| `/admin` | KPI overview + next bookings |
| `/admin/bookings` (+`/[id]`) | Filterable list; detail with confirm/arrive/in-service/complete/miss/cancel, stylist assignment, internal notes, full history |
| `/admin/customers` (+`/[id]`) | Search/filter; detail with subscriptions, visit adjustment, manual activation, tags, notes, archive |
| `/admin/retention` | 7 actionable views (no booking, unused visits, expiring, expired, missed, pending selections, no upcoming) |
| `/admin/upsell` | Add-on adoption, top extras, per-plan attach rate, favourites — labelled pending/selected value |
| `/admin/plans` (+`/new`, `/[id]`) | Full plan CRUD, status actions, duplicate, reorder, version history |
| `/admin/categories` | Category CRUD + archive |
| `/admin/services` | Core service CRUD |
| `/admin/extra-services` (+`/new`, `/[id]`) | Add-on CRUD incl. eligibility + payment requirement |
| `/admin/consultations` | Booking requests (confirm/complete/cancel) + type list |
| `/admin/products` (+`/new`, `/[id]`) | Product CRUD |
| `/admin/recommendations` (+`/new`, `/[id]`) | Recommendation rule CRUD |
| `/admin/settings` | Booking rules, opening/weekend hours, blackout dates, service areas |
| `/admin/operations` | Operations dashboard: subscription health, capacity, upselling, inventory, expenses, support |
| `/admin/inventory` (+`/new`, `/[id]`) | Item register with live levels; detail = movement form + full ledger |
| `/admin/inventory/receiving` | Stock receipts (draft → confirm posts to ledger once) |
| `/admin/inventory/counts` | Physical counts with variance review/approval |
| `/admin/inventory/alerts` | Out-of-stock, low, expired/expiring, high-value adjustments |
| `/admin/inventory/templates` | Per-service consumption templates (services + extras) |
| `/admin/inventory/categories`, `/admin/inventory/settings` | Category CRUD; expiry window, negative-stock, adjustment threshold |
| `/admin/suppliers` | Supplier CRUD; bank details restricted to admins |
| `/admin/equipment` | Equipment register, condition changes, maintenance logs |
| `/admin/expenses` (+`/recurring`, `/dashboard`, `/categories`) | Expense workflow (draft→approval→paid/void), recurring templates, spending dashboard, categories + threshold |
| `/admin/support` (+`/[id]`, `/replies`) | Staff inbox with filters; thread with internal notes + saved replies |
| `/admin/capacity` | Utilisation, warnings, per-plan limits, capacity settings |
| `/admin/salons` (+`/new`, `/[id]`) | Salon CRUD, launch/pause/reopen/close, staff↔salon assignments, waitlist expansion dashboard, affected-members list |
| `/admin/reports` | Memberships by home salon, visits by serving salon, cross-salon flow (v3 §7.4) |
| `/admin/migration` | Member migration import: dry-run + idempotent activation (v3 §9) |

## Staff — `/staff` (role: staff or admin)

| Route | Purpose |
| ----- | ------- |
| `/staff` → `/staff/bookings` | Assigned-to-me + unassigned bookings; links into the shared booking detail |

## API

| Route | Purpose |
| ----- | ------- |
| `GET /api/slots?date&location&duration` | Available start times via `fn_get_available_slots` |

Route protection: `middleware.ts` redirects by session + role (UX);
`requireCustomer` / `requireStaffOrAdmin` / `requireAdmin` re-check on every
page; RLS enforces the actual data boundary.
