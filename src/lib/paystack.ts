import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure Paystack helpers (payments spec §9, §12).
 * Webhook signature verification and event normalization — no I/O, so the
 * webhook's security-critical parts are unit-testable.
 */

/** Paystack signs the raw request body with HMAC-SHA512 of the secret key. */
export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null | undefined,
  secretKey: string,
): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Stable idempotency key for a delivered event. Paystack events carry no
 * event id, so the key combines the event type with the most specific
 * reference the payload offers (charge reference, invoice code or
 * subscription code). Duplicate deliveries produce the same key and are
 * rejected by the payment_events unique constraint (§12).
 */
export function paystackEventKey(evt: PaystackEvent): string {
  const d = evt.data ?? {};
  const ref =
    (d.reference as string) ||
    (d.invoice_code as string) ||
    ((d.subscription as Record<string, unknown> | undefined)?.subscription_code as string) ||
    (d.subscription_code as string) ||
    (d.id != null ? String(d.id) : "unknown");
  return `${evt.event}:${ref}`;
}

export interface ChargeInfo {
  reference: string;
  amountKobo: number;
  intentId: string | null;
  customerCode: string | null;
  customerEmail: string | null;
  planCode: string | null;
  authorization: Record<string, unknown> | null;
}

/** Normalize a charge.success payload (initial checkout or renewal charge). */
export function extractChargeInfo(evt: PaystackEvent): ChargeInfo {
  const d = evt.data ?? {};
  const metadata = (d.metadata ?? {}) as Record<string, unknown>;
  const customer = (d.customer ?? {}) as Record<string, unknown>;
  const plan = (d.plan ?? {}) as Record<string, unknown>;
  return {
    reference: String(d.reference ?? ""),
    amountKobo: Number(d.amount ?? 0),
    intentId: typeof metadata.intent_id === "string" && metadata.intent_id
      ? metadata.intent_id : null,
    customerCode: (customer.customer_code as string) ?? null,
    customerEmail: (customer.email as string) ?? null,
    planCode: (plan.plan_code as string) ?? null,
    authorization: (d.authorization as Record<string, unknown>) ?? null,
  };
}

export interface SubscriptionInfo {
  subscriptionCode: string | null;
  emailToken: string | null;
  customerCode: string | null;
  customerEmail: string | null;
  planCode: string | null;
  nextPaymentDate: string | null;
  status: string | null;
}

/** Normalize subscription.* and invoice.* payloads. */
export function extractSubscriptionInfo(evt: PaystackEvent): SubscriptionInfo {
  const d = evt.data ?? {};
  const sub = (d.subscription ?? d) as Record<string, unknown>;
  const customer = ((d.customer ?? sub.customer) ?? {}) as Record<string, unknown>;
  const plan = ((d.plan ?? sub.plan) ?? {}) as Record<string, unknown>;
  return {
    subscriptionCode: (sub.subscription_code as string) ?? null,
    emailToken: (sub.email_token as string) ?? null,
    customerCode: (customer.customer_code as string) ?? null,
    customerEmail: (customer.email as string) ?? null,
    planCode: (plan.plan_code as string) ?? null,
    nextPaymentDate: (sub.next_payment_date as string) ?? null,
    status: (sub.status as string) ?? null,
  };
}
