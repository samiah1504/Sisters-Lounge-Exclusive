# Architecture

## Overview

```
Browser (mobile-first UI)
  │
  ├─ Next.js App Router (React Server Components + Server Actions)
  │    ├─ (public)   marketing, plan browsing, auth
  │    ├─ /app       customer area (role: customer)
  │    ├─ /admin     admin area   (role: admin)
  │    └─ /staff     staff area   (role: staff/admin)
  │
  └─ Supabase
       ├─ Auth (cookie sessions via @supabase/ssr)
       └─ PostgreSQL
            ├─ RLS policies      ← the real security boundary
            └─ SECURITY DEFINER functions ← the only write path for
               bookings, reservations, entitlements, assignments
```

## Layers

| Layer | Location | Rules |
| ----- | -------- | ----- |
| Pure business logic | `src/lib/` | No I/O; mirrors DB rules for instant UX validation; fully unit-tested |
| Data access | `src/server/` | Server-only; cookie-scoped Supabase client (RLS applies) |
| Mutations | `src/server/actions/` | Server actions; zod-validated; critical writes call SQL functions via RPC |
| Database | `supabase/migrations/` | Source of truth for every business rule |

## Key decisions

1. **The database is the arbiter.** Every rule the UI checks (interval,
   capacity, eligibility, notice) is re-checked inside transaction-safe
   `SECURITY DEFINER` functions (`fn_book_appointment`, `fn_complete_appointment`,
   `fn_release_appointment`, `fn_reschedule_appointment`, `fn_assign_stylist`,
   `fn_adjust_visit_balance`, …). Client checks are UX sugar. This makes the
   future payment webhook safe: it calls the same functions users do.

2. **Reservation vs consumption.** `visit_entitlements` rows move
   `available → reserved → consumed` (or back to `available` on release).
   `visit_reservations` is the audit trail; partial unique indexes guarantee
   one active reservation per entitlement and per appointment. Completion is
   idempotent-guarded (`ALREADY_COMPLETED`).

3. **Plan versioning.** A trigger snapshots every material plan change into
   `subscription_plan_versions`; subscriptions reference the version they
   were sold under, so admin edits never rewrite history.

4. **Concurrency.** Capacity checks serialize on
   `pg_advisory_xact_lock(date+location)`; entitlement grabs use
   `FOR UPDATE SKIP LOCKED`; stylist double-booking is an exclusion
   constraint (GiST on `tstzrange`), not application logic.

5. **Money & time.** All money is integer **kobo** (`*_kobo`). All "day"
   logic is computed in **Africa/Lagos** (`lagos_date()` in SQL,
   `lagosDateOf()` in TS).

6. **Retention & recommendations are data, not code.**
   `fn_generate_retention_prompts` upserts deduplicated prompts keyed by
   stable `prompt_key`s; recommendation rules/targets/items are admin-managed
   rows resolved by `src/lib/recommendations.ts`. No AI, no hardcoding.

7. **Graceful degradation without Supabase.** `isSupabaseConfigured()` lets
   public pages render with empty states and protected pages redirect to
   login, so the app builds and boots in CI with no secrets.

## Error contract

SQL functions raise errors prefixed with stable codes
(`INTERVAL:`, `CAPACITY:`, `NO_VISITS:`, `CYCLE:`, `PROFILE_INCOMPLETE:`, …).
`src/server/actions/customer.ts#friendlyDbError` maps them to human copy.
New codes must be added in both places.

## Testing strategy

| Suite | Runs where | Proves |
| ----- | ---------- | ------ |
| `src/**/*.test.ts` (39) | anywhere | pure rules: interval, durations, eligibility, transitions, recommendations |
| `tests/integration` (36) | local Postgres 16 (`npm run db:reset`) | migrations apply; RLS isolation; booking/reservation/consumption; 7-day rule; capacity; audit |
| `e2e/public.spec.ts` (6) | any dev server | mobile layout, no overflow, nav, auth redirects |
| `e2e/authenticated.spec.ts` (8) | live Supabase + seed (`E2E_SUPABASE=1`) | full customer/admin flows |

The integration harness impersonates users exactly like PostgREST does
(`SET ROLE` + `request.jwt.claims`), so RLS results match production.
