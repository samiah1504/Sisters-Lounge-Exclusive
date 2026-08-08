import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractChargeInfo,
  extractSubscriptionInfo,
  paystackEventKey,
  verifyPaystackSignature,
  type PaystackEvent,
} from "@/lib/paystack";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { sendEmail } from "@/server/email";
import { paymentFailedEmail, welcomeEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook — the authoritative confirmation of every payment event
 * (payments spec §9, §12). The browser redirect never activates anything;
 * this endpoint does, exactly once per event:
 *
 * - The signature is verified against the raw body before anything is read.
 * - Every delivery is recorded in payment_events under a computed unique
 *   key. A replayed delivery hits the ledger and is acknowledged without
 *   reprocessing; a delivery that previously errored is reprocessed.
 * - Money/cycle writes go through the definer functions from 0029, which
 *   are themselves idempotent on the provider charge reference — duplicate
 *   memberships, cycles, entitlements and payment rows are impossible even
 *   if the ledger were bypassed.
 * - A handler failure returns 500 so Paystack retries the delivery.
 */

type Admin = SupabaseClient;

const lagosDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric",
  });

function siteUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}

export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !hasServiceRoleKey()) {
    return new NextResponse("payments not configured", { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  if (!verifyPaystackSignature(raw, signature, secret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let evt: PaystackEvent;
  try {
    evt = JSON.parse(raw) as PaystackEvent;
  } catch {
    return new NextResponse("invalid payload", { status: 400 });
  }
  if (!evt?.event) return new NextResponse("invalid payload", { status: 400 });

  const admin = createAdminClient();
  const key = paystackEventKey(evt);

  // Idempotency ledger (spec §12): first delivery inserts; duplicates are
  // acknowledged; deliveries that errored before are reprocessed.
  const { error: insertErr } = await admin
    .from("payment_events")
    .insert({ event_key: key, event_type: evt.event, payload: evt });
  if (insertErr) {
    const { data: existing } = await admin
      .from("payment_events")
      .select("id, status")
      .eq("event_key", key)
      .maybeSingle();
    if (!existing) {
      return new NextResponse("ledger unavailable", { status: 500 });
    }
    if (existing.status !== "error") {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  try {
    const note = await handleEvent(admin, evt, siteUrl(req));
    await admin
      .from("payment_events")
      .update({ status: note ? "processed" : "skipped", note: note ?? "unhandled event type" })
      .eq("event_key", key);
    return NextResponse.json({ received: true });
  } catch (err) {
    await admin
      .from("payment_events")
      .update({ status: "error", note: err instanceof Error ? err.message : String(err) })
      .eq("event_key", key);
    return new NextResponse("processing failed", { status: 500 });
  }
}

/** Returns a processing note, or null when the event type is not handled. */
async function handleEvent(
  admin: Admin,
  evt: PaystackEvent,
  site: string,
): Promise<string | null> {
  switch (evt.event) {
    case "charge.success": {
      const info = extractChargeInfo(evt);
      if (!info.reference) throw new Error("charge without reference");

      if (info.intentId) {
        // Initial checkout charge → activate through the standard path (§6).
        const { data: subId, error } = await admin.rpc("fn_activate_paid_subscription", {
          p_intent_id: info.intentId,
          p_provider_reference: info.reference,
          p_amount_kobo: info.amountKobo,
          p_provider_customer_code: info.customerCode,
          p_provider_plan_code: info.planCode,
          p_authorization: info.authorization,
        });
        if (error) throw new Error(`activation failed: ${error.message}`);
        await sendWelcome(admin, subId as string, site);
        return `membership ${subId} activated`;
      }

      // Recurring charge → renewal (§7). Match the billing relationship by
      // the provider's customer + plan pair.
      const membershipId = await matchMembership(admin, info.customerCode, info.planCode);
      if (!membershipId) {
        throw new Error(
          `no membership matches customer ${info.customerCode ?? "?"} / plan ${info.planCode ?? "?"}`,
        );
      }
      const { error: renewErr } = await admin.rpc("fn_renew_subscription_cycle", {
        p_subscription_id: membershipId,
        p_provider_reference: info.reference,
        p_amount_kobo: info.amountKobo,
      });
      if (renewErr) throw new Error(`renewal failed: ${renewErr.message}`);
      return `membership ${membershipId} renewed`;
    }

    case "subscription.create": {
      // Attach the provider's subscription identity to the newest billing
      // row for this customer + plan (created at activation).
      const info = extractSubscriptionInfo(evt);
      if (!info.subscriptionCode) throw new Error("subscription.create without code");
      const { data: rows } = await admin
        .from("payment_subscriptions")
        .select("id")
        .eq("provider_customer_code", info.customerCode ?? "")
        .eq("provider_plan_code", info.planCode ?? "")
        .is("provider_subscription_code", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!rows?.[0]) return "no pending billing row to attach (already attached?)";
      await admin
        .from("payment_subscriptions")
        .update({
          provider_subscription_code: info.subscriptionCode,
          provider_email_token: info.emailToken,
          next_billing_at: info.nextPaymentDate,
        })
        .eq("id", rows[0].id);
      return `billing ${info.subscriptionCode} attached`;
    }

    case "invoice.create":
    case "invoice.update": {
      // Advance the next billing date; the money itself arrives as
      // charge.success (renewing here as well would double-cycle).
      const info = extractSubscriptionInfo(evt);
      if (info.subscriptionCode && info.nextPaymentDate) {
        await admin
          .from("payment_subscriptions")
          .update({ next_billing_at: info.nextPaymentDate })
          .eq("provider_subscription_code", info.subscriptionCode);
      }
      return "billing date noted";
    }

    case "invoice.payment_failed": {
      const info = extractSubscriptionInfo(evt);
      const membershipId = await membershipBySubscriptionCode(admin, info.subscriptionCode);
      if (!membershipId) throw new Error(`no membership for ${info.subscriptionCode ?? "?"}`);
      const reference =
        (evt.data?.invoice_code as string) ?? paystackEventKey(evt);
      const { error } = await admin.rpc("fn_record_payment_failure", {
        p_subscription_id: membershipId,
        p_provider_reference: reference,
        p_amount_kobo: Number(evt.data?.amount ?? 0),
        p_reason: "recurring charge failed at provider",
      });
      if (error) throw new Error(`failure recording failed: ${error.message}`);
      await notifyPaymentFailed(admin, membershipId, site);
      return `payment failure recorded for ${membershipId}`;
    }

    case "subscription.not_renew": {
      const info = extractSubscriptionInfo(evt);
      await admin
        .from("payment_subscriptions")
        .update({ status: "cancelling" })
        .eq("provider_subscription_code", info.subscriptionCode ?? "");
      return "cancellation pending";
    }

    case "subscription.disable": {
      // Future billing stops; membership history and the current paid cycle
      // are untouched (payments spec §10, §11).
      const info = extractSubscriptionInfo(evt);
      const membershipId = await membershipBySubscriptionCode(admin, info.subscriptionCode);
      await admin
        .from("payment_subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("provider_subscription_code", info.subscriptionCode ?? "");
      if (membershipId) {
        await admin
          .from("subscriptions")
          .update({ opt_out_next_renewal: true })
          .eq("id", membershipId);
      }
      return "billing stopped";
    }

    default:
      return null;
  }
}

async function matchMembership(
  admin: Admin,
  customerCode: string | null,
  planCode: string | null,
): Promise<string | null> {
  if (!customerCode) return null;
  let query = admin
    .from("payment_subscriptions")
    .select("subscription_id")
    .eq("provider_customer_code", customerCode)
    .order("created_at", { ascending: false })
    .limit(1);
  if (planCode) query = query.eq("provider_plan_code", planCode);
  const { data } = await query;
  return data?.[0]?.subscription_id ?? null;
}

async function membershipBySubscriptionCode(
  admin: Admin,
  code: string | null,
): Promise<string | null> {
  if (!code) return null;
  const { data } = await admin
    .from("payment_subscriptions")
    .select("subscription_id")
    .eq("provider_subscription_code", code)
    .maybeSingle();
  return data?.subscription_id ?? null;
}

interface MemberContact {
  email: string | null;
  fullName: string;
  planName: string;
}

async function memberContact(
  admin: Admin,
  subscriptionId: string,
): Promise<(MemberContact & { salonName: string; visits: number; startsOn: string }) | null> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "id, customer:customer_profiles(profile:profiles(full_name, email)), " +
        "plan:subscription_plans(name), salon:salons!subscriptions_home_salon_id_fkey(name)",
    )
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return null;
  const { data: cycle } = await admin
    .from("subscription_cycles")
    .select("starts_on, visits_included")
    .eq("subscription_id", subscriptionId)
    .order("cycle_number", { ascending: false })
    .limit(1);
  const row = sub as unknown as {
    customer: { profile: { full_name: string; email: string | null } | null } | null;
    plan: { name: string } | null;
    salon: { name: string } | null;
  };
  return {
    email: row.customer?.profile?.email ?? null,
    fullName: row.customer?.profile?.full_name ?? "",
    planName: row.plan?.name ?? "Membership",
    salonName: row.salon?.name ?? "Sisters Lounge Salon",
    visits: cycle?.[0]?.visits_included ?? 0,
    startsOn: cycle?.[0]?.starts_on ?? new Date().toISOString(),
  };
}

async function sendWelcome(admin: Admin, subscriptionId: string, site: string) {
  const contact = await memberContact(admin, subscriptionId);
  if (!contact?.email) return;
  await sendEmail(
    contact.email,
    welcomeEmail({
      memberName: contact.fullName,
      planName: contact.planName,
      salonName: contact.salonName,
      visitsIncluded: contact.visits,
      startDate: lagosDate(contact.startsOn),
      siteUrl: site,
    }),
  );
}

async function notifyPaymentFailed(admin: Admin, subscriptionId: string, site: string) {
  const contact = await memberContact(admin, subscriptionId);
  if (!contact?.email) return;
  await sendEmail(
    contact.email,
    paymentFailedEmail({
      memberName: contact.fullName,
      planName: contact.planName,
      siteUrl: site,
    }),
  );
}
