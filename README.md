# Sisters Lounge

**Nigeria's First Members-Only Natural Hair Club** — membership,
reservations and salon-operations platform for Sisters Lounge Salons.

Members hold a monthly membership with a set number of salon visits,
valid at every Sisters Lounge Salon nationwide (multi-location, not
multi-tenant). They reserve visits ahead, manage children's memberships,
add extra services, book Expert Consultations, shop products and chat
with the team. Staff and admins run salons, members, reservations,
plans, stylists, retention, inventory, expenses, capacity, no-show
policy and support.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS 4**
- **Supabase** (PostgreSQL + Auth + RLS) — plain SQL migrations in `supabase/migrations/`
- **Vitest** (unit + DB integration tests) · **Playwright** (mobile e2e)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project credentials
npm run dev
```

Without Supabase credentials the app still runs: public pages render with
empty states and protected areas redirect to login.

### Setting up Supabase

1. Create a project at supabase.com and copy the URL + anon key into `.env.local`.
2. Apply migrations: `supabase link && supabase db push` (or run each file in
   `supabase/migrations/` through the SQL editor, in order).
3. Dev data (optional): run `npx tsx scripts/create-dev-users.ts` with the
   service-role key, then run `supabase/seed.sql`.
4. For Admin → Staff (creating staff/stylist logins from the app), also set
   `SUPABASE_SERVICE_ROLE_KEY` as a server-side env var in your deployment.

### Local database verification (no Supabase account needed)

The full schema, RLS policies and booking functions can be verified against
local PostgreSQL 16:

```bash
npm run db:reset          # init cluster, apply auth shim + migrations + seed
npm run test:integration  # 92 tests: RLS, reservations, salons, ledger, expenses, chat, capacity
```

## Scripts

| Command | What it does |
| ------- | ------------ |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (pure business logic) |
| `npm run test:integration` | DB integration tests against local Postgres |
| `npm run db:reset` | Recreate the local verification database |
| `npx playwright test e2e/` | Mobile e2e (public specs run anywhere; authenticated specs need `E2E_SUPABASE=1`) |

## Business rules (enforced in the database)

- Sisters Lounge is **members-only** — no walk-ins. Every membership lasts
  one monthly cycle; unused visits **expire** at cycle end and never roll over.
- Visits must be at least **7 days apart** (configurable per plan), across
  every salon; one visit per day per member profile.
- Booking **reserves** a visit; only completion **consumes** it. Missed and
  salon-cancelled appointments release the reservation.
- A paid active cycle cannot be cancelled or paused; customers may opt out of
  the next renewal. Plan changes take effect next cycle.
- Customers never choose stylists — the salon assigns them (double-booking is
  blocked by a database constraint).
- Visits are **portable**: any open Sisters Lounge Salon honours any
  membership; the home salon only attributes and defaults.
- Missed visits are never confiscated; repeated no-shows warn, then briefly
  pause self-service reservations (configurable per salon).
- No live payments exist yet: plan selections, prepaid add-ons and paid
  consultations create **pending payment** records only.
- Inventory quantities change **only** through the immutable stock-movement
  ledger; appointment consumption is staff-confirmed, never auto-deducted.
- Expenses follow draft → approval → paid/voided; nobody can approve their
  own expense, and posted records are corrected by voiding, not editing.
- New subscription activations hard-stop at capacity limits unless an admin
  overrides with an audited reason.

### Scheduled jobs (Supabase cron)

| Function | Suggested schedule |
| -------- | ------------------ |
| `fn_expire_cycles()` | daily |
| `fn_generate_recurring_expenses()` | daily |

## Documentation

- `docs/architecture.md` — system design and data-access strategy
- `docs/database.md` — schema, functions and RLS reference
- `docs/routes.md` — route map
- `docs/permissions.md` — role & permission matrix
- `docs/phase-2-completion.md` — Phase 2 delivery report
- `docs/phase-3-completion.md` — Phase 3 delivery report (operations, inventory, expenses, chat, capacity)
- `docs/v3-completion.md` — v3 members-club pivot report **+ production cutover runbook**
