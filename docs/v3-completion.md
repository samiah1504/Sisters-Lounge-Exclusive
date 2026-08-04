# v3 Completion Report — Nigeria's First Members-Only Natural Hair Club

Sessions A (multi-salon retrofit), B (members' club rebrand) and C
(completion) delivered on branch `claude/v3-members-club`, one feature per
commit, tests written alongside. This report doubles as the production
cutover guide.

## What v3 delivers

### The pivot (Session A)
- **Multi-salon, not multi-tenant**: `salons`, per-salon hours/blackouts/
  settings, staff↔salon assignments, per-salon inventory stock; one brand,
  one member base, national pricing.
- **Portable visits (§4.4)**: memberships carry a `home_salon_id`
  (attribution + defaults, restricts nothing); members reserve at any open
  salon. Cross-salon rules enforced in SQL: one visit/day per member (#37),
  the 168-hour interval regardless of salon (#40).
- **Home service removed outright (§4.8)**; history keeps
  `was_home_visit = true` (owner ruling C4-original).
- **Salon-scoped RLS via JWT claims** (custom access token hook + live
  fallback) and the **visiting-member rule (§10)**: staff see a member's
  records only where she has a visit at their salon; admins unscoped.

### The identity (Session B)
- Vocabulary: member / membership / Reserve Visit / Sisters Lounge Salon /
  Chat with Us / Expert Consultations — public, member, staff and admin
  surfaces; retention prompt copy migrated in SQL (0024).
- Welcome hero (Become a Member · Sign In · Explore), four-slide onboarding
  (shown once, replayable from Profile), public Salons page with per-city
  waitlist capture, plans page stating the five plain-language rules above
  every join button.

### The completion (Session C)
| Feature | Where |
|---|---|
| Salon management: CRUD, launch/pause/reopen/close (releases future reservations at no member cost, #34–35), staff assignments (#36 guard), city-waitlist expansion dashboard, affected-members contact list | `/admin/salons`, 0025 |
| Expert Consultation membership benefits: included ×N/cycle, member price, standard — resolved by the database, shown automatically to each member | plan editor, `/app/consultations`, 0026 |
| Forward-looking reservation guard (§5.6): non-blocking warning + `entitlement_at_risk` flag feeding retention | wizard review step, 0027 |
| No-show tracking (§5.7 owner-amended): grace period before "missed", history visible to managers and the member, configurable warn/pause thresholds per salon with brand default; staff can always reserve on a member's behalf | Scheduling Settings, member detail, 0028 |
| Salon dimension (§7.4): serving-salon filter on Reserved Visits, home-salon filter on retention, reports for both dimensions + cross-salon flow | `/admin/reports` |
| Public content pages in club voice | About, Treatments, FAQ, Contact, Terms, Privacy, Refund Policy |
| Member migration import (§9): dry-run, idempotent, activates via the standard function | `/admin/migration` |

## Edge-case matrix (#33–40)

| # | Case | Implementation | Test |
|---|---|---|---|
| 33 | Member of A served at B | Portable booking + cross-salon flow report | ✅ integration |
| 34 | Pause with future reservations | `fn_pause_salon` releases + contact list UI | ✅ integration |
| 35 | Salon closes before a reserved date | `fn_close_salon`, same semantics | ✅ integration |
| 36 | Stylist reassigned across salons | Per-salon schedules; unassignment blocked while upcoming assigned visits exist | server-action guard (UI-level) |
| 37 | Same member, two salons, same day | Recipient-level daily uniqueness in `fn_book_appointment` | ✅ integration |
| 38 | Pickup at zero-stock salon | Per-salon stock is live; pickup UI ships with Orders (deferred phase) | structural |
| 39 | Waitlist-city member joins early | Activation requires an open home salon; waitlist capture otherwise | ✅ integration |
| 40 | Interval across salons | Salon-independent interval check | ✅ integration |

## Verification (all run in this environment)

| Check | Result |
|---|---|
| Unit tests | **50 passed** |
| Integration (fresh Postgres 16, migrations 0001–0028 + seed) | **92 passed** |
| `tsc --noEmit`, ESLint | clean |
| Production build | success |
| Playwright public specs (Pixel 7) | 9 passed (15 authenticated self-skip without live Supabase) |
| Overflow at 360/390/412/430 px across 9 public pages | none |

## Production cutover runbook

The live site currently runs pre-v3 code against a database at migration
0011. Code and SQL must land together. Pick a quiet hour (~15 minutes).

**Pre-flight (any time before):**
1. In Vercel, confirm `SUPABASE_SERVICE_ROLE_KEY` is set (staff creation +
   member import need it).
2. In the admin, check for any **live home-service appointments** — 0021
   refuses to run while one exists (reschedule or release them first). If
   the salon never used home service, skip.
3. Have `supabase/migrations/0012 … 0028` open in order.

**Cutover:**
4. Supabase SQL editor: run **0012 → 0028 one file at a time, in order**,
   normal Run (not "Run with RLS"). Each should end "Success. No rows
   returned." (0021/0024/0028 may print notices — fine). **Stop and report
   if any file errors; do not continue past a failure.**
5. Merge `claude/v3-members-club` into the default branch → Vercel deploys
   the v3 app (~2 minutes).
6. During the gap between steps 4 and 5 the old app cannot take new
   reservations (its booking function was replaced) — that's the quiet-hour
   window.

**Post-cutover checks (5 minutes):**
7. Homepage shows the members-club welcome; `/salons` lists Ilorin (open)
   — Abuja/waitlist appears only if you run the seed's salon block or
   create it in **Admin → Operations → Salons**.
8. Sign in as admin: Operations → Salons shows Ilorin with your real
   hours (copied from your existing settings by 0019).
9. Reserve a visit as a test member end-to-end.
10. Optional: enable the **custom access token hook**
    (Authentication → Hooks → `custom_access_token_hook`) — staff salon
    scoping already works via the built-in fallback; the hook simply moves
    it into the JWT as §10 specifies.
11. Existing cron jobs (`fn_expire_cycles`, `fn_generate_recurring_expenses`)
    carry over untouched.

**Rollback:** the pivot migrations are one-way (they delete home-service
structure). If step 4 fails midway, the failed file's changes rolled back
with its transaction — fix, re-run that file, continue. Do not attempt to
hand-reverse earlier files.

## Known limitations / deferred (owner ruling)

Hair profiles & journey, reviews, notifications + push/PWA, orders &
checkout (incl. #38 pickup UI), loyalty, referrals, community, campaigns,
franchise architecture, Paystack/Flutterwave, AI recommendations. Chat
attachments and expense receipt uploads still await a Storage bucket.
Imported members sign in via "Forgot password" (no invite emails until the
notifications phase).

## Recommended next phase

Payments (Paystack): first-charge checkout + stored-authorisation renewals
with the §5.9 retry ladder — every write path was built so a payment
webhook calls the same SQL functions the manual flow uses today.
