# Phase 3 Completion Report — Salon Operations

Salon operations, inventory, expenses, customer support chat and
subscription capacity. Built on the Phase 1/2 foundation without changing
any existing behaviour — all Phase 2 tests still pass unmodified.

## What was delivered

### Inventory (3-type system)
- **Item register** for consumables, retail stock and equipment-tracked
  items: SKU, category, unit, reorder level/quantity, cost & selling price
  (kobo), supplier, storage location, expiry date, salon-use/retail flags.
- **Immutable stock ledger** (`inventory_movements`, 16 movement types).
  Quantities on items are trigger-guarded — the only write path is
  `fn_post_stock_movement` (row-locked, `NEGATIVE_STOCK` protection).
  Editing or deleting a ledger row raises `LEDGER_IMMUTABLE`.
- **Receiving**: draft receipts with line items; confirming posts every
  line to the ledger exactly once (`ALREADY_POSTED`) and updates cost
  prices.
- **Stock counts**: physical counts with generated variance columns;
  high-value variances require a second approver (`SELF_APPROVAL` blocked
  unless admin); approval posts `stock_count_correction` movements.
- **Alerts**: out-of-stock, at/below reorder level, expired, expiring soon
  (configurable window), negative stock, missing supplier, high-value
  adjustments.
- **Consumption templates** per service *and* per extra service; staff
  confirm actual usage on completed appointments (prefilled from
  templates, deviation >25% requires a reason, posts once). **Nothing is
  ever auto-deducted.**
- **Suppliers** with bank details in a separate, admin-only table.
- **Equipment register** with condition audit trail and maintenance logs;
  retiring an asset auto-unassigns and deactivates it.
- **Retail link**: products linked to inventory items mirror real
  availability into `products.stock_status` via triggers (0018) — customers
  see honest in-stock/low/out-of-stock without any access to inventory
  tables.

### Expenses
- Workflow: **draft → pending_approval → approved/rejected → paid/voided**
  via `fn_expense_transition`. Non-draft rows are locked
  (`EXPENSE_LOCKED`); corrections are void-with-reason, never edits.
- **Self-approval is impossible for everyone, including admins.** Amounts
  above the configurable threshold (default ₦100,000) need an admin
  approver. Every transition is audited.
- **Recurring templates** generate one draft per due date, idempotently
  (`fn_generate_recurring_expenses`, cron-able).
- Spending dashboard by category/month; expense categories + threshold
  managed in-app. Expenses can link suppliers, stock receipts and
  appointments.

### Customer support chat ("Chat with Your Salon Manager")
- Private customer ↔ salon conversations (11 topics, priorities,
  statuses, per-side read cursors, first-response time).
- **Internal notes are never visible to customers** — enforced by RLS and
  a trigger that strips the internal flag from any customer message.
  Sender identity is trigger-forced (no impersonation); closed
  conversations reject new messages; messages are append-only.
- Staff inbox with filters (active/unread/urgent/waiting/unassigned),
  search, assignment, saved replies; customer side has unread badges, a
  dashboard entry card and a WhatsApp fallback link.
- Polling refresh every 15 s — no websockets needed at this scale.

### Subscription capacity
- Limits at four levels: per-plan (`subscriber_limit`), per-category,
  global and home-service, plus max promised visits per cycle.
- `fn_check_activation_capacity` hard-stops activations at any limit
  (`CAPACITY_FULL`) unless an admin overrides **with a reason**, recorded
  in `capacity_overrides` and the audit log.
- `/admin/capacity` shows live utilisation (promised visits vs slot supply
  derived from opening hours × slot length × per-slot capacity), warnings
  at configurable thresholds, and per-plan counts vs limits.
- `/admin/operations` gives one screen: subscription health, capacity,
  upselling pipeline (explicitly labelled *not yet collected*), inventory
  alerts, this month's expenses (paid vs approved-awaiting-payment,
  clearly separated) and support load.

## Migrations (apply in order on live Supabase)

| File | Contents |
| ---- | -------- |
| `0012_inventory.sql` | units, categories, suppliers (+separate bank table), items, settings, product link |
| `0013_stock_operations.sql` | movement ledger + posting fn, receipts, counts, consumption templates + posting fn |
| `0014_equipment.sql` | equipment assets + logs + condition audit |
| `0015_expenses.sql` | categories, settings, expenses + workflow fn, recurring templates + generator |
| `0016_support_chat.sql` | conversations, messages (+guard triggers), saved replies |
| `0017_capacity_permissions_rls.sql` | capacity tables/fns, capacity-aware activation, 32 permissions, staff grants, all Phase 3 RLS |
| `0018_product_stock_sync.sql` | product ↔ inventory availability sync triggers |

`supabase/seed.sql` gained a Phase 3 block: suppliers, 12 items with
opening stock (including low-stock, expiring and out-of-stock examples), a
confirmed receipt, a submitted count, consumption templates, equipment,
expenses in every workflow state, a recurring template and three seeded
conversations (including a staff internal note used by the privacy tests).

## Architecture decisions

1. **Ledger over counters.** Stock quantities are outputs of an immutable
   movement ledger. Guard triggers + transaction-local GUCs
   (`app.stock_internal`, `app.expense_internal`) mean even admins cannot
   bypass the workflow with direct UPDATEs.
2. **Idempotency everywhere.** Receipt confirmation, count approval,
   appointment consumption and recurring-expense generation all post
   exactly once (`ALREADY_POSTED` or unique keys).
3. **Chat rules in triggers, not clients.** Truthful sender, forced
   non-internal customer messages, closed-conversation blocks and counter
   maintenance all live in the database.
4. **Capacity computed live.** No cached utilisation tables — warnings
   derive from entitlements + scheduling settings at read time, so they
   are never stale.
5. **Money discipline.** Pending payment intents and approved-but-unpaid
   expenses are always labelled as such; nothing pending is ever presented
   as collected revenue.

## Verification (all run in this environment)

| Check | Result |
| ----- | ------ |
| `npm test` (unit) | **46 passed** |
| `npm run test:integration` (fresh Postgres 16, all 18 migrations + seed) | **64 passed** |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` (production) | success, all routes compile |
| Playwright public specs (Pixel 7) | **7 passed** (15 authenticated specs self-skip without live Supabase) |
| Mobile overflow at 360/390/412/430 px | no horizontal scroll on any checked page |

Integration coverage added for Phase 3: ledger immutability, direct-write
guards, negative stock, double-posting, count self-approval, expense
workflow (incl. self-approval and void-reason), chat privacy (internal
notes invisible, no impersonation, closed threads), capacity hard-stop +
audited override, and product availability sync.

## Manual steps to go live

1. **Run migrations 0012–0018** in the Supabase SQL editor, one file at a
   time, in order (same procedure as Phase 2).
2. **Re-run the Phase 3 part of `supabase/seed.sql`** only if you want the
   demo operations data; production can start clean — the pages all have
   empty states.
3. **Schedule a second cron job**: `select public.fn_generate_recurring_expenses();`
   daily (next to the existing `fn_expire_cycles()` job).
4. **Update the WhatsApp number**: `src/app/app/support/page.tsx` still has
   the placeholder `https://wa.me/2348000000000`.

## Known limitations

- **Chat attachments**: the schema supports them, but the upload UI is
  deferred — it needs a Supabase Storage bucket created manually first.
- **Receipt images on expenses**: same reason — `receipt_url` exists, no
  uploader yet.
- Support chat uses 15-second polling, not realtime subscriptions
  (adequate for current volume, easy to upgrade later).
- Operations dashboard month figures use calendar months (Africa/Lagos
  dates come from expense_date fields).
- Still out of scope by design: live payments/renewals/refunds, payroll,
  WhatsApp Business API, AI chatbot.

## Recommended Phase 4

Payment integration (Paystack): confirm pending payment intents
automatically, renewals, add-on payments and expense settlement — the
definer-function write paths were built so a payment webhook can call the
same functions users do.
