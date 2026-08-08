# Automatic Subscription Payments (Paystack)

Membership purchase and renewal are billed automatically through
Paystack-managed subscription plans. The application owns membership state
(subscriptions, cycles, visit entitlements, salon assignment, business
rules); Paystack owns the recurring charge, retry behaviour and card
storage. The webhook is the authoritative source of payment truth — the
browser redirect never activates anything.

## The flow

```
Homepage → Choose Your Membership → /join/[plan]
  → account created (pending, no benefits) + fn_select_plan(plan, salon)
  → Paystack transaction initialized (plan code + intent metadata)
  → member pays on Paystack's secure page
  → webhook charge.success → fn_activate_paid_subscription
       → membership active, cycle created, visits allocated,
         home salon recorded, payment stored, welcome email sent
  → /join/confirming polls state → member dashboard
```

Renewals: Paystack charges on schedule → webhook `charge.success` (no
intent metadata) → `fn_renew_subscription_cycle` → next cycle + fresh
entitlements; a queued plan change (`next_plan_id`) is applied here.
Failures: `invoice.payment_failed` → membership status `payment_failed`,
member notified, Paystack retries; the next successful charge renews
normally. Cancellation: stops future billing only — the paid cycle and
every historical record stay intact.

## Environment variables

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `PAYSTACK_SECRET_KEY` | server only | API calls + webhook signature verification |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | public | reserved for inline/browser flows |
| `RESEND_API_KEY` | server only | transactional email; email is silently disabled until set |
| `EMAIL_FROM` | server only | verified sender, e.g. `Sisters Lounge <hello@yourdomain>` (optional; Resend's onboarding sender is used until then) |
| `NEXT_PUBLIC_SITE_URL` | public | absolute links in emails (optional; falls back to the request origin) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | already required; used by checkout account creation and the webhook |

Without the Paystack keys, checkout shows a friendly "online payment is
not enabled yet" message and nothing else breaks.

## Paystack dashboard setup

1. Settings → API Keys & Webhooks → copy the **test** secret/public keys
   into Vercel first; verify the whole flow with test cards
   (e.g. `4084 0840 8408 4081`, any future expiry, any CVV).
2. Same screen → set the **Webhook URL** to
   `https://<your-domain>/api/webhooks/paystack`.
3. Paystack Plans are created automatically by the app (one per
   membership plan, prefixed "Sisters Lounge —") at first checkout. A
   price edit mints a new provider plan; existing subscribers keep the
   price they signed up under.
4. When test flows pass, swap in the live keys and set the webhook URL
   in the live domain settings too.

## Database (migration 0029)

- `payment_subscriptions` — one billing relationship per membership:
  provider codes, card display metadata (brand/last4 only — never raw
  card data), amount, status, next billing date.
- `payments` — every charge, unique on the provider reference.
- `payment_events` — webhook ledger, unique per delivery; duplicates are
  acknowledged and skipped, errored deliveries reprocess on retry.
- `fn_activate_paid_subscription` / `fn_renew_subscription_cycle` /
  `fn_record_payment_failure` — SECURITY DEFINER, idempotent on the
  provider reference, callable only from trusted server contexts;
  entitlement logic is reused from `fn_activate_manual_subscription`,
  never duplicated.
- Capacity no longer gates membership activation anywhere (owner
  decision): it applies only when reserving visits; the capacity
  dashboard remains as an advisory planning tool.

## Membership-first access

- `/register` no longer creates standalone accounts — it routes into the
  membership flow; accounts are created inside checkout and hold no
  benefits until payment confirms.
- An account with no membership history is redirected from `/app` to
  `/join/resume` (resume pending checkout or choose a plan). Any
  membership history — active, expired, payment-failed, cancelling —
  keeps full dashboard access.
- Admin and staff authentication are unchanged. The manual activation
  path (`fn_activate_manual_subscription`) remains for the salon team,
  child memberships and migrated members.

## What stays manual for now

Add-on (extra service) payments, paid consultations and product purchases
still use pending-payment records settled at the salon. Member-initiated
plan changes are deferred: Paystack subscriptions bill a fixed plan
amount, so a self-service plan switch needs a cancel-and-resubscribe flow
— the salon team can queue a plan change (`next_plan_id`) which applies
at the next renewal.
