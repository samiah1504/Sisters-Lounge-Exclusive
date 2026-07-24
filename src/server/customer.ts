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
  extras: Array<{ price_kobo: number; duration_minutes: number; extra_service: { name: string } }>;
}

export async function getAppointments(
  customerId: string,
): Promise<AppointmentWithService[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "*, service:services(*), child:children(*), extras:appointment_extra_services(price_kobo, duration_minutes, extra_service:extra_services(name))",
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
      "*, service:services(*), child:children(*), extras:appointment_extra_services(price_kobo, duration_minutes, extra_service:extra_services(name))",
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

export async function getFavourites(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favourites")
    .select("*")
    .eq("customer_id", customerId);
  return data ?? [];
}

export interface SchedulingInfo {
  slotDurationMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  rescheduleDeadlineHours: number;
  supportedServiceAreas: string[];
  businessHours: Array<{
    day_of_week: number;
    is_open: boolean;
    open_time: string;
    close_time: string;
  }>;
}

export async function getSchedulingInfo(): Promise<SchedulingInfo | null> {
  const supabase = await createClient();
  const [{ data: settings }, { data: hours }] = await Promise.all([
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("business_hours").select("*").order("day_of_week"),
  ]);
  if (!settings?.[0]) return null;
  const s = settings[0];
  return {
    slotDurationMinutes: s.slot_duration_minutes,
    minNoticeHours: s.min_booking_notice_hours,
    maxAdvanceDays: s.max_advance_booking_days,
    rescheduleDeadlineHours: s.reschedule_deadline_hours,
    supportedServiceAreas: s.supported_service_areas,
    businessHours: hours ?? [],
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
