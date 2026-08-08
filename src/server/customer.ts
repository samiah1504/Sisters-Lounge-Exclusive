import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Appointment,
  Child,
  PendingPlanSelection,
  RetentionPrompt,
  Service,
  Subscription,
  SubscriptionCycle,
  SubscriptionPlan,
  VisitEntitlement,
} from "@/lib/types";
import { lagosDateOf } from "@/lib/format";
import { visitSummary, type VisitSummary } from "@/lib/booking-rules";
import type { Row } from "@/lib/db-rows";

export interface SubscriptionOverview {
  subscription: Subscription;
  plan: SubscriptionPlan;
  cycle: SubscriptionCycle | null;
  entitlements: VisitEntitlement[];
  summary: VisitSummary;
  child: Child | null;
  /** Lagos dates of live appointments counting toward the interval rule. */
  liveVisitDates: string[];
}

const LIVE_STATUSES = [
  "pending_addon_payment", "pending_confirmation", "confirmed",
  "assigned", "arrived", "in_service", "completed",
];

export async function getSubscriptionOverviews(
  customerId: string,
): Promise<SubscriptionOverview[]> {
  const supabase = await createClient();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*), child:children(*)")
    .eq("customer_id", customerId)
    .in("status", ["active", "expiring_soon", "renewal_due", "expired"])
    .order("created_at", { ascending: false });
  if (!subs) return [];

  const out: SubscriptionOverview[] = [];
  for (const row of subs) {
    const { data: cycles } = await supabase
      .from("subscription_cycles")
      .select("*")
      .eq("subscription_id", row.id)
      .order("cycle_number", { ascending: false });
    const cycle =
      cycles?.find((c) => c.status === "active") ?? cycles?.[0] ?? null;

    let entitlements: VisitEntitlement[] = [];
    if (cycle) {
      const { data } = await supabase
        .from("visit_entitlements")
        .select("*")
        .eq("cycle_id", cycle.id)
        .order("seq_number");
      entitlements = data ?? [];
    }

    const { data: appts } = await supabase
      .from("appointments")
      .select("starts_at, status")
      .eq("subscription_id", row.id)
      .in("status", LIVE_STATUSES);

    out.push({
      subscription: row as Subscription,
      plan: row.plan as SubscriptionPlan,
      child: (row.child as Child | null) ?? null,
      cycle,
      entitlements,
      summary: visitSummary(entitlements),
      liveVisitDates: (appts ?? []).map((a) => lagosDateOf(a.starts_at)),
    });
  }
  return out;
}

export async function getChildren(customerId: string): Promise<Child[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at");
  return data ?? [];
}

export interface AppointmentWithService extends Appointment {
  service: Service;
  child: Child | null;
  salon: { id: string; name: string; city: string; address: string } | null;
  extras: Array<{ price_kobo: number; duration_minutes: number; extra_service: { name: string } }>;
}

export async function getAppointments(
  customerId: string,
): Promise<AppointmentWithService[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "*, service:services(*), child:children(*), salon:salons(id, name, city, address), extras:appointment_extra_services(price_kobo, duration_minutes, extra_service:extra_services(name))",
    )
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false });
  return (data ?? []) as unknown as AppointmentWithService[];
}

export async function getAppointment(
  customerId: string,
  appointmentId: string,
): Promise<AppointmentWithService | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "*, service:services(*), child:children(*), salon:salons(id, name, city, address), extras:appointment_extra_services(price_kobo, duration_minutes, extra_service:extra_services(name))",
    )
    .eq("customer_id", customerId)
    .eq("id", appointmentId)
    .limit(1);
  return ((data ?? [])[0] as unknown as AppointmentWithService) ?? null;
}

export async function getRetentionPrompts(
  customerId: string,
): Promise<RetentionPrompt[]> {
  const supabase = await createClient();
  // Regenerate (idempotent, deduplicated), then read.
  await supabase.rpc("fn_generate_retention_prompts", {
    p_customer_id: customerId,
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const { data } = await supabase
    .from("retention_prompts")
    .select("*")
    .eq("customer_id", customerId)
    .is("dismissed_at", null)
    .lte("starts_on", today)
    .or(`expires_on.is.null,expires_on.gte.${today}`)
    .order("priority", { ascending: false });
  return data ?? [];
}

export async function getPendingSelection(
  customerId: string,
): Promise<(PendingPlanSelection & { plan: SubscriptionPlan }) | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pending_plan_selections")
    .select("*, plan:subscription_plans(*)")
    .eq("customer_id", customerId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as (PendingPlanSelection & { plan: SubscriptionPlan })) ?? null;
}

/* ------------------------------------------------ billing (payments spec) */

export interface BillingInfo {
  subscription_id: string;
  status: string;
  amount_kobo: number;
  card_brand: string | null;
  card_last4: string | null;
  next_billing_at: string | null;
  cancelled_at: string | null;
  has_provider_subscription: boolean;
}

/** Billing relationship per membership (payments spec §10). RLS scopes to
 * the signed-in member's own rows. */
export async function getBillingInfos(): Promise<Map<string, BillingInfo>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_subscriptions")
    .select(
      "subscription_id, status, amount_kobo, card_brand, card_last4, " +
        "next_billing_at, cancelled_at, provider_subscription_code",
    );
  const map = new Map<string, BillingInfo>();
  for (const row of ((data ?? []) as unknown as Row[])) {
    map.set(row.subscription_id, {
      subscription_id: row.subscription_id,
      status: row.status,
      amount_kobo: Number(row.amount_kobo),
      card_brand: row.card_brand,
      card_last4: row.card_last4,
      next_billing_at: row.next_billing_at,
      cancelled_at: row.cancelled_at,
      has_provider_subscription: Boolean(row.provider_subscription_code),
    });
  }
  return map;
}

/** The member's payment history, newest first (payments spec §10). */
export async function getPaymentHistory(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, provider_reference, kind, amount_kobo, status, failure_reason, paid_at, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(24);
  return data ?? [];
}

export async function getFavourites(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favourites")
    .select("*")
    .eq("customer_id", customerId);
  return data ?? [];
}

export interface SchedulingInfo {
  minNoticeHours: number;
  maxAdvanceDays: number;
  rescheduleDeadlineHours: number;
  /** Open salons a member can reserve at (visits are portable, v3 §4.4). */
  salons: Array<{ id: string; name: string; city: string; address: string }>;
  salonHours: Array<{
    salon_id: string;
    day_of_week: number;
    is_open: boolean;
    open_time: string;
    close_time: string;
  }>;
}

export async function getSchedulingInfo(): Promise<SchedulingInfo | null> {
  const supabase = await createClient();
  const [{ data: settings }, { data: salons }, { data: hours }] = await Promise.all([
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("salons").select("id, name, city, address")
      .eq("status", "open").order("name"),
    supabase.from("salon_hours").select("*").order("day_of_week"),
  ]);
  if (!settings?.[0]) return null;
  const s = settings[0];
  return {
    minNoticeHours: s.min_booking_notice_hours,
    maxAdvanceDays: s.max_advance_booking_days,
    rescheduleDeadlineHours: s.reschedule_deadline_hours,
    salons: salons ?? [],
    salonHours: hours ?? [],
  };
}

/** Extra services with their eligibility lists attached. */
export async function getExtraServicesWithEligibility() {
  const supabase = await createClient();
  const [{ data: extras }, { data: planElig }, { data: catElig }] =
    await Promise.all([
      supabase
        .from("extra_services")
        .select("*")
        .eq("is_active", true)
        .eq("is_public", true)
        .is("archived_at", null)
        .order("display_order"),
      supabase.from("extra_service_plan_eligibility").select("*"),
      supabase.from("extra_service_customer_eligibility").select("*"),
    ]);
  return (extras ?? []).map((e) => ({
    ...e,
    eligible_plan_ids: (planElig ?? [])
      .filter((p) => p.extra_service_id === e.id)
      .map((p) => p.plan_id),
    eligible_category_ids: (catElig ?? [])
      .filter((c) => c.extra_service_id === e.id)
      .map((c) => c.category_id),
  }));
}

export async function getRecommendationRules() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("recommendation_rules")
    .select("*, targets:recommendation_targets(*), items:recommendation_items(*)")
    .eq("is_active", true);
  return rules ?? [];
}
