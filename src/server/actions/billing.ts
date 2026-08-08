"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { requireCustomer } from "@/server/auth";
import {
  disableProviderSubscription,
  paystackConfigured,
  subscriptionUpdateCardLink,
} from "@/server/paystack";

/**
 * Member billing controls (payments spec §10): cancel automatic renewal
 * (stops future billing, keeps every historical record and the paid cycle),
 * and update the payment card via the provider's secure page. Ownership is
 * proven by RLS — the billing row is only readable by its member.
 */

export interface ActionState {
  error?: string;
  success?: string;
}

async function ownBillingRow(subscriptionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_subscriptions")
    .select("id, subscription_id, status, provider_subscription_code, provider_email_token")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  return data;
}

export async function cancelAutoRenewal(subscriptionId: string): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const billing = await ownBillingRow(subscriptionId);
  if (!billing) return { error: "No automatic billing found for this membership." };
  if (["cancelled", "cancelling"].includes(billing.status)) {
    return { success: "Automatic renewal is already stopped." };
  }

  // Stop the provider's recurring charge first; the webhook confirms with
  // subscription.disable. Memberships whose provider identity has not
  // arrived yet still get the domain-level opt-out below.
  if (
    paystackConfigured() &&
    billing.provider_subscription_code &&
    billing.provider_email_token
  ) {
    try {
      await disableProviderSubscription(
        billing.provider_subscription_code,
        billing.provider_email_token,
      );
    } catch {
      return {
        error:
          "We could not reach the payment provider — please try again shortly or chat with us.",
      };
    }
  }

  const { error: optErr } = await supabase.rpc("fn_set_renewal_opt_out", {
    p_subscription_id: subscriptionId,
    p_opt_out: true,
  });
  if (optErr) return { error: "Could not update your renewal preference." };

  if (hasServiceRoleKey()) {
    await createAdminClient()
      .from("payment_subscriptions")
      .update({ status: "cancelling" })
      .eq("id", billing.id)
      .in("status", ["pending", "active", "payment_failed"]);
  }

  revalidatePath("/app/subscription");
  return {
    success:
      "Automatic renewal stopped. Your current cycle runs to the end — nothing already paid is affected.",
  };
}

export async function openCardUpdateLink(subscriptionId: string): Promise<ActionState> {
  await requireCustomer();
  const billing = await ownBillingRow(subscriptionId);
  if (!billing?.provider_subscription_code) {
    return { error: "No automatic billing found for this membership." };
  }
  if (!paystackConfigured()) {
    return { error: "Online payment is not enabled yet." };
  }
  let link: string;
  try {
    link = await subscriptionUpdateCardLink(billing.provider_subscription_code);
  } catch {
    return {
      error: "We could not reach the payment provider — please try again shortly.",
    };
  }
  redirect(link);
}
