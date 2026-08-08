import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Paystack API access (payments spec §5). Secret-key operations are
 * server-side only; nothing here is importable from client components.
 * All amounts are integer kobo — Paystack's native unit too.
 */

const BASE = "https://api.paystack.co";

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function paystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

async function ps<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackSecretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
  if (!res.ok || !body?.status) {
    throw new Error(`Paystack ${path}: ${body?.message ?? res.statusText}`);
  }
  return body.data;
}

/* ------------------------------------------------------------ transactions */

export interface InitializedTransaction {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** Initialize a checkout charge that also creates the recurring subscription
 * (Paystack subscribes the customer to the plan when the charge succeeds). */
export async function initializeSubscriptionTransaction(args: {
  email: string;
  amountKobo: number;
  planCode: string;
  callbackUrl: string;
  intentId: string;
}): Promise<InitializedTransaction> {
  return ps<InitializedTransaction>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      plan: args.planCode,
      currency: "NGN",
      callback_url: args.callbackUrl,
      metadata: { intent_id: args.intentId },
    }),
  });
}

export interface VerifiedTransaction {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number;
}

export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  return ps<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/* ------------------------------------------------------------------- plans */

interface PaystackPlan {
  plan_code: string;
}

/**
 * Every sellable Sisters Lounge plan maps to a Paystack Plan (payments spec
 * §3), created lazily at first checkout. A price edit mints a new provider
 * plan; existing subscribers keep billing at the price they signed up under
 * (the plan-versioning philosophy applied to billing).
 */
export async function ensureProviderPlan(plan: {
  id: string;
  name: string;
  monthly_price_kobo: number;
  provider_plan_code: string | null;
  provider_plan_amount_kobo: number | null;
}): Promise<string> {
  if (
    plan.provider_plan_code &&
    Number(plan.provider_plan_amount_kobo) === Number(plan.monthly_price_kobo)
  ) {
    return plan.provider_plan_code;
  }
  const created = await ps<PaystackPlan>("/plan", {
    method: "POST",
    body: JSON.stringify({
      name: `Sisters Lounge — ${plan.name}`,
      interval: "monthly",
      amount: plan.monthly_price_kobo,
      currency: "NGN",
    }),
  });
  const admin = createAdminClient();
  await admin
    .from("subscription_plans")
    .update({
      provider_plan_code: created.plan_code,
      provider_plan_amount_kobo: plan.monthly_price_kobo,
    })
    .eq("id", plan.id);
  return created.plan_code;
}

/* ---------------------------------------------------------- subscriptions */

/** Stop future billing (payments spec §10). Membership records stay intact —
 * this only ends the provider's recurring charge. */
export async function disableProviderSubscription(
  subscriptionCode: string,
  emailToken: string,
): Promise<void> {
  await ps("/subscription/disable", {
    method: "POST",
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });
}

/** Paystack-hosted page where the member updates their card (spec §10). */
export async function subscriptionUpdateCardLink(
  subscriptionCode: string,
): Promise<string> {
  const data = await ps<{ link: string }>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
  );
  return data.link;
}
