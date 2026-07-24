# Phase 2 Completion Report

**Scope:** Customer experience, subscription catalogue, booking, retention
and upselling — plus the application foundation (the repository previously
contained only a static homepage, so the Next.js/Supabase/auth/RBAC
foundation described as "Phase 1" was built first in the same delivery).

**No live payment provider is integrated anywhere.** Pending-payment states
and service interfaces exist for the payments phase; no card billing,
checkout, transfers, refunds, tips, reviews, WhatsApp/email delivery or
financial reporting were built, and no successful payments are faked.

---

## Features completed

### Customer capabilities
- Registration/sign-in (Supabase auth, cookie sessions), auto-provisioned
  customer profile
- Profile completion flow with required-for-booking fields, contact +
  notification preferences, marketing consent, service-area confirmation;
  role/status/internal fields are not editable (trigger + RLS enforced)
- Child profiles: add/edit/view/archive/restore, care notes, per-child visit
  history; archives blocked while an upcoming appointment exists; children
  with history can never be hard-deleted (FK RESTRICT)
- Plan browsing/filtering, detail pages, polished comparison table
- Pending plan selection (no activation, superseding + cancel + change),
  with pending payment intent
- Six-step mobile booking wizard: recipient → location → included service →
  date/time (generated slots) → **ENHANCE YOUR VISIT** add-ons (rule-based
  recommendations, eligibility-filtered, price/duration badges) → review
  summary (Included · per-add-on prices · total · duration · payment status)
- Appointment pages: upcoming/past, detail with add-on summary,
  payment-pending, missed and completed states; reschedule flow that
  preserves the visit reservation; cancellation deliberately de-emphasised
- Consultation catalogue + pending consultation bookings (subscriber
  discount applied, subscriber-only gating)
- Product catalogue with search, category filter, subscriber pricing
  display, detail pages; generic favourites (products, extras, consultations)
- Renewal opt-out toggle (paid cycles can never be cancelled or paused)
- Retention prompts on the dashboard (dismissible, deduplicated)

### Admin capabilities
- Overview KPIs; booking management with 8 filters, search and date filter;
  booking detail with confirm / arrived / in-service / complete / missed /
  cancel actions, internal notes, status + reschedule + assignment history
- Stylist assignment with skill matching and DB-level double-booking
  protection; customers can never select stylists
- Customer management: search/filters, detail with subscriptions and
  balances, manual (test/migration) subscription activation, audited visit
  adjustment (reason required), tags, internal notes, archive/restore
- Catalogue management: categories, plans (full field set, statuses,
  duplicate, reorder, version history), services, extra services (incl.
  plan/category eligibility + payment requirement), products,
  consultation requests
- Retention views: no booking this cycle, unused visits, expiring soon,
  expired, missed, pending selections, no upcoming visit — all linking to
  customer detail
- Upsell views: bookings with/without add-ons, most-selected extras,
  per-plan attach rates, average selected value, pending add-on value,
  most-favourited products — all labelled selected/pending value, never
  collected revenue
- Settings: booking rules, opening/weekend hours, blackout dates,
  home-service capacity and service areas
- Staff workspace: assigned-to-me + unassigned bookings

### Retention & upselling engines
- `fn_generate_retention_prompts`: 6 rule families (visits expiring,
  no booking this cycle, subscription expiring, upcoming visit, missed
  appointment, expired subscription, pending selection) with stable
  `prompt_key` dedupe — regeneration never stacks duplicates and never
  resurrects dismissed prompts (verified by integration test)
- Rule-based recommendations (rules → targets → items) across six contexts,
  admin-configured badges ("Customers often add", …), priority resolution
  with per-item dedupe — no AI, nothing hardcoded

## Database migrations added

11 migrations (`supabase/migrations/0001…0011`), creating 40 tables,
14 lifecycle functions, 12 triggers and full RLS — see `docs/database.md`.
All requested tables exist (service_staff_skills was intentionally folded
into `services.required_skill` + `stylist_skills`, documented below).

## Tests

| Suite | Result |
| ----- | ------ |
| Unit (Vitest, pure logic) | **39/39 passed** |
| DB integration (real Postgres 16 + RLS impersonation) | **36/36 passed** |
| Playwright public mobile specs | **6/6 passed** (Pixel-7 viewport) |
| Playwright authenticated specs | 8 written, self-skip without a live Supabase project (`E2E_SUPABASE=1`) |

Integration coverage includes every Module 33 integration scenario that is
DB-verifiable: child isolation, anon plan browsing, pending selection,
plan create/archive/versioning, eligible + ineligible bookings, reservation
vs consumption, missed-releases-visit, double-completion block, 7-day rule,
capacity, stylist assignment (customer blocked / admin allowed / history),
reschedule preservation + cycle bound, visit adjustment audit + reason
requirement, consultation booking, favourites isolation, retention dedupe.

## Commands run (final state)

```
npm run lint              # ✓ 0 problems
npm run typecheck         # ✓ clean
npm test                  # ✓ 39 passed
npm run db:reset          # ✓ 11 migrations + seed applied
npm run test:integration  # ✓ 36 passed
npm run build             # ✓ 43 routes compiled
npx playwright test e2e/  # ✓ 6 passed, 8 skipped (need live Supabase)
```

Mobile rendering verified in Chromium at **360 / 390 / 412 / 430 px**:
zero horizontal overflow and zero JS errors on all public pages; bottom
navigation, sticky booking action bar and stacked cards in place.

## Required environment variables

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Public anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | shell only | dev-user script only — never in the app |

No secrets are committed (`.env*` gitignored; `.env.example` documents them).

## Manual steps required from you

1. Create a Supabase project; put URL + anon key in `.env.local`.
2. Apply `supabase/migrations/*` in order (CLI `db push` or SQL editor).
3. Optional dev data: `npx tsx scripts/create-dev-users.ts` (service key),
   then run `supabase/seed.sql`. Dev password: `SistersLounge!Dev1`.
4. Make yourself admin: `update profiles set role='admin' where email='…';`
5. Schedule `select fn_expire_cycles();` daily (Supabase cron) so ended
   cycles expire automatically.
6. Deploy (e.g. Vercel) with the two public env vars.

## Known limitations

- Generated DB types are not wired (no live project yet): admin pages with
  nested selects cast through a documented loose `Row` type
  (`src/lib/db-rows.ts`). Run `supabase gen types` once the project exists.
- Admin calendar is list/filter-based; day/week/month grid views deferred.
- Consultation-type editing UI is read-only (types are seeded); photo
  uploads and questionnaires need Supabase Storage (payments phase).
- Profile photo / image uploads deferred to Supabase Storage work.
- Stylist working-hours are stored but availability generation currently
  enforces salon capacity, not per-stylist calendars (assignment conflicts
  ARE blocked by constraint).
- Recommendation → selection conversion attribution is a foundation only.
- `service_staff_skills` simplified into `services.required_skill` matching
  `stylist_skills.skill`.
- Authenticated e2e suite needs a live Supabase project to execute.

## Intentionally deferred to Phase 3 (recommendation)

**Phase 3 = Payments & Activation:** Paystack integration (NGN), webhook →
`fn_activate_manual_subscription`-style activation path for pending
selections, add-on prepayment settlement, consultation payment, automatic
renewal + `fn_expire_cycles` scheduling, receipts, and real revenue
reporting (replacing today's pending/selected-value labels). The pending
payment intents, subscription statuses and definer functions were designed
so the webhook only fulfils intents — no schema rework expected.
