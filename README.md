# Sisters Lounge Exclusive

Salon subscription, booking and hair-care management platform for
**Sisters Lounge** (Ilorin, Nigeria).

Customers subscribe to a monthly salon plan, book their visits ahead, track
remaining visits, manage plans for their children, add extra paid services,
book paid consultations and browse hair-care products. Staff and admins
manage subscribers, bookings, plans, stylists, retention and upselling.

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

### Local database verification (no Supabase account needed)

The full schema, RLS policies and booking functions can be verified against
local PostgreSQL 16:

```bash
npm run db:reset          # init cluster, apply auth shim + migrations + seed
npm run test:integration  # 36 tests: RLS isolation, booking, 7-day rule, …
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

- Every subscription lasts one monthly cycle; unused visits **expire** at
  cycle end and never roll over.
- Subscription visits must be at least **7 days apart** (configurable per plan).
- Booking **reserves** a visit; only completion **consumes** it. Missed and
  salon-cancelled appointments release the reservation.
- A paid active cycle cannot be cancelled or paused; customers may opt out of
  the next renewal. Plan changes take effect next cycle.
- Customers never choose stylists — the salon assigns them (double-booking is
  blocked by a database constraint).
- Home service is limited to supported areas (currently Ilorin).
- No live payments exist yet: plan selections, prepaid add-ons and paid
  consultations create **pending payment** records only.

## Documentation

- `docs/architecture.md` — system design and data-access strategy
- `docs/database.md` — schema, functions and RLS reference
- `docs/routes.md` — route map
- `docs/permissions.md` — role & permission matrix
- `docs/phase-2-completion.md` — Phase 2 delivery report
