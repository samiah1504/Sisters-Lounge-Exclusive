"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { getSession } from "@/server/auth";
import {
  ensureProviderPlan,
  initializeSubscriptionTransaction,
  paystackConfigured,
} from "@/server/paystack";

/**
 * Membership checkout (payments spec §4, §5): account creation is part of
 * checkout, payment happens at Paystack, and activation only ever happens
 * in the webhook once the provider confirms the charge (§9). Nothing here
 * activates a membership.
 */

export interface CheckoutState {
  error?: string;
}

const checkoutSchema = z.object({
  plan_slug: z.string().trim().min(1),
  salon_id: z.string().uuid("Choose your home salon"),
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  whatsapp_number: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signedInSchema = checkoutSchema.omit({
  full_name: true, email: true, phone: true, whatsapp_number: true, password: true,
});

export async function startMembershipCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured yet — see README setup steps." };
  }
  if (!paystackConfigured()) {
    return {
      error:
        "Online payment is not enabled yet. Please contact us and we will activate your membership personally.",
    };
  }

  const supabase = await createClient();
  let session = await getSession();
  if (session && session.profile.role !== "customer") {
    return { error: "Staff and admin accounts cannot purchase memberships." };
  }

  let email: string;

  if (!session) {
    const parsed = checkoutSchema.safeParse({
      plan_slug: formData.get("plan_slug"),
      salon_id: formData.get("salon_id"),
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      whatsapp_number: formData.get("whatsapp_number") || undefined,
      password: formData.get("password"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (!hasServiceRoleKey()) {
      return { error: "Checkout is not fully configured yet (missing server key)." };
    }

    // The account is created pending — it holds no membership until the
    // provider confirms payment (payments spec §6): an abandoned checkout
    // leaves an unsubscribed account that can resume and pay later.
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name },
    });
    if (createErr || !created.user) {
      if (/already/i.test(createErr?.message ?? "")) {
        return {
          error:
            "You already have an account with this email — sign in first, then continue your membership.",
        };
      }
      return { error: createErr?.message ?? "Could not create your account." };
    }
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInErr) {
      return { error: "Account created, but sign-in failed — please sign in and try again." };
    }
    await admin
      .from("profiles")
      .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
      .eq("id", created.user.id);
    await admin
      .from("customer_profiles")
      .update({
        whatsapp_number: parsed.data.whatsapp_number || parsed.data.phone,
      })
      .eq("profile_id", created.user.id);

    session = await getSession();
    if (!session) return { error: "Sign-in did not stick — please sign in and retry." };
    email = parsed.data.email;
  } else {
    const parsed = signedInSchema.safeParse({
      plan_slug: formData.get("plan_slug"),
      salon_id: formData.get("salon_id"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    email = session.profile.email ?? "";
    if (!email) return { error: "Your account has no email address — contact support." };
  }

  const planSlug = String(formData.get("plan_slug"));
  const salonId = String(formData.get("salon_id"));

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select(
      "id, name, slug, status, is_public, monthly_price_kobo, provider_plan_code, provider_plan_amount_kobo",
    )
    .eq("slug", planSlug)
    .maybeSingle();
  if (!plan || plan.status !== "active" || !plan.is_public) {
    return { error: "This membership is not open to new members right now." };
  }

  if (!session.customerProfile) {
    return { error: "Your member profile is still being prepared — try again in a moment." };
  }

  // Friendly pre-check; the database enforces it again at activation.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", session.customerProfile.id)
    .is("child_id", null)
    .in("status", ["active", "expiring_soon", "renewal_due"])
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "You already have an active membership. Manage it from your dashboard." };
  }

  // Pending selection + payment intent through the standard function —
  // the amount is snapshotted server-side, never taken from the form.
  const { error: selErr } = await supabase.rpc("fn_select_plan", {
    p_plan_id: plan.id,
    p_child_id: null,
    p_home_salon_id: salonId,
  });
  if (selErr) {
    if (/SALON_UNAVAILABLE/.test(selErr.message)) {
      return { error: "That salon is not open yet — choose an open salon." };
    }
    return { error: "Could not prepare your membership. Please try again." };
  }

  const { data: intents } = await supabase
    .from("pending_payment_intents")
    .select("id, amount_kobo")
    .eq("purpose", "subscription_activation")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  const intent = intents?.[0];
  if (!intent) return { error: "Could not prepare the payment. Please try again." };

  let authorizationUrl: string;
  try {
    const planCode = await ensureProviderPlan(plan);
    const h = await headers();
    const origin =
      h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const init = await initializeSubscriptionTransaction({
      email,
      amountKobo: Number(intent.amount_kobo),
      planCode,
      callbackUrl: `${origin}/join/confirming`,
      intentId: intent.id,
    });
    authorizationUrl = init.authorization_url;
  } catch {
    return {
      error:
        "We could not reach the payment provider. Nothing was charged — please try again shortly.",
    };
  }

  redirect(authorizationUrl);
}

/**
 * Resume an abandoned checkout (payments spec §6 amendment, owner decision
 * 6): the pending account and plan selection survive, so the member can
 * return and pay later. Re-initializes payment for the existing intent —
 * nothing is re-selected and the snapshotted amount is reused.
 */
export async function resumeMembershipCheckout(
  _prev: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  if (!paystackConfigured()) {
    return {
      error:
        "Online payment is not enabled yet. Please contact us and we will activate your membership personally.",
    };
  }
  const session = await getSession();
  if (!session || session.profile.role !== "customer") {
    redirect("/login?next=/join/resume");
  }
  const email = session.profile.email;
  if (!email) return { error: "Your account has no email address — contact support." };

  const supabase = await createClient();
  const { data: intents } = await supabase
    .from("pending_payment_intents")
    .select(
      "id, amount_kobo, selection:pending_plan_selections(child_id, home_salon_id, " +
        "plan:subscription_plans(id, name, slug, status, is_public, monthly_price_kobo, " +
        "provider_plan_code, provider_plan_amount_kobo))",
    )
    .eq("purpose", "subscription_activation")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  const intent = intents?.[0] as unknown as {
    id: string;
    amount_kobo: number;
    selection: {
      child_id: string | null;
      home_salon_id: string | null;
      plan: {
        id: string; name: string; slug: string; status: string; is_public: boolean;
        monthly_price_kobo: number;
        provider_plan_code: string | null; provider_plan_amount_kobo: number | null;
      } | null;
    } | null;
  } | undefined;
  if (!intent?.selection?.plan) redirect("/plans");
  const { selection } = intent;
  if (selection.child_id) {
    return {
      error:
        "This selection is for a child — chat with us and the salon team will activate it with you.",
    };
  }
  if (!selection.home_salon_id) {
    // Selected before checkout captured home salons — redo through checkout.
    redirect(`/join/${selection.plan!.slug}`);
  }

  try {
    const planCode = await ensureProviderPlan(selection.plan!);
    const h = await headers();
    const origin =
      h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const init = await initializeSubscriptionTransaction({
      email,
      amountKobo: Number(intent.amount_kobo),
      planCode,
      callbackUrl: `${origin}/join/confirming`,
      intentId: intent.id,
    });
    redirect(init.authorization_url);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // NEXT_REDIRECT
    return {
      error:
        "We could not reach the payment provider. Nothing was charged — please try again shortly.",
    };
  }
}

/**
 * Polled by the confirming page. Reads state only — activation is the
 * webhook's job alone (payments spec §9).
 */
export async function checkMembershipActivated(): Promise<
  "active" | "pending" | "unauthenticated"
> {
  const session = await getSession();
  if (!session || !session.customerProfile) return "unauthenticated";
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", session.customerProfile.id)
    .is("child_id", null)
    .in("status", ["active", "expiring_soon", "renewal_due"])
    .limit(1);
  return data && data.length > 0 ? "active" : "pending";
}
