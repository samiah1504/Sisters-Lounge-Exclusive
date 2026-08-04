/**
 * Pure booking business rules. These mirror the authoritative SQL functions
 * so the UI can validate before submitting; the database remains the final
 * arbiter for every rule.
 */

export interface AddonLike {
  price_kobo: number;
  estimated_duration_minutes: number;
}

/** Whole days between two calendar dates (YYYY-MM-DD), absolute. */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(
    Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)),
  );
  const db = Date.UTC(
    Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)),
  );
  return Math.abs(Math.round((da - db) / 86_400_000));
}

/**
 * Seven-day (configurable) interval rule: the candidate date must be at
 * least `intervalDays` whole days from every existing live visit date.
 * Returns the offending date, or null when the candidate is valid.
 */
export function intervalConflict(
  existingDates: string[],
  candidate: string,
  intervalDays: number,
): string | null {
  for (const d of existingDates) {
    if (daysBetween(d, candidate) < intervalDays) return d;
  }
  return null;
}

/** Total appointment duration: included service + all selected add-ons. */
export function totalDuration(serviceMinutes: number, addons: AddonLike[]): number {
  return addons.reduce((t, a) => t + a.estimated_duration_minutes, serviceMinutes);
}

/** Total add-on price in kobo. */
export function addonTotal(addons: AddonLike[]): number {
  return addons.reduce((t, a) => t + a.price_kobo, 0);
}

/** Does a slot of `durationMinutes` starting at `start` (HH:MM) fit hours? */
export function fitsWithinHours(
  start: string,
  durationMinutes: number,
  openTime: string,
  closeTime: string,
): boolean {
  const toMin = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  return s >= toMin(openTime) && s + durationMinutes <= toMin(closeTime);
}

export interface EntitlementLike {
  status: "available" | "reserved" | "consumed" | "expired" | "revoked";
}

export interface VisitSummary {
  included: number;
  used: number;
  reserved: number;
  remaining: number;
}

/** Visit balance for a cycle. Revoked entitlements are excluded entirely. */
export function visitSummary(entitlements: EntitlementLike[]): VisitSummary {
  const counted = entitlements.filter((e) => e.status !== "revoked");
  const used = counted.filter((e) => e.status === "consumed").length;
  const reserved = counted.filter((e) => e.status === "reserved").length;
  const remaining = counted.filter((e) => e.status === "available").length;
  return { included: counted.length, used, reserved, remaining };
}

export interface ProfileCompletion {
  complete: boolean;
  missing: string[];
}

/** Required fields before booking (mirrors is_profile_booking_ready). */
export function profileCompletion(p: {
  full_name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
}): ProfileCompletion {
  const missing: string[] = [];
  if (!p.full_name?.trim()) missing.push("Full name");
  if (!p.phone?.trim()) missing.push("Phone number");
  if (!p.whatsapp_number?.trim()) missing.push("WhatsApp number");
  return { complete: missing.length === 0, missing };
}

export const RESCHEDULABLE_STATUSES = [
  "pending_addon_payment",
  "pending_confirmation",
  "confirmed",
  "assigned",
] as const;

/** Can the CUSTOMER still reschedule this appointment? */
export function canReschedule(
  status: string,
  startsAt: string | Date,
  deadlineHours: number,
  now: Date = new Date(),
): boolean {
  if (!RESCHEDULABLE_STATUSES.includes(status as never)) return false;
  const deadline = new Date(startsAt).getTime() - deadlineHours * 3_600_000;
  return now.getTime() < deadline;
}

/** Valid appointment status transitions for staff tooling. */
export const APPOINTMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_confirmation", "expired"],
  pending_addon_payment: ["confirmed", "cancelled_salon", "cancelled_admin", "expired"],
  pending_confirmation: ["confirmed", "assigned", "cancelled_salon", "cancelled_admin", "no_longer_eligible"],
  confirmed: ["assigned", "arrived", "in_service", "missed", "cancelled_salon", "cancelled_admin"],
  assigned: ["arrived", "in_service", "missed", "cancelled_salon", "cancelled_admin"],
  arrived: ["in_service", "completed"],
  in_service: ["completed"],
  completed: [],
  rescheduled: [],
  missed: [],
  cancelled_salon: [],
  cancelled_admin: [],
  no_longer_eligible: [],
  expired: [],
};

export function canTransition(from: string, to: string): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Subscription status transitions permitted for admin tooling. */
export const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_payment", "active", "archived"],
  pending_payment: ["active", "payment_failed", "archived"],
  active: ["expiring_soon", "renewal_due", "expired", "suspended", "cancelled_by_admin"],
  expiring_soon: ["renewal_due", "expired", "active", "suspended"],
  renewal_due: ["active", "expired", "opted_out", "payment_failed"],
  payment_failed: ["active", "expired", "archived"],
  expired: ["archived"],
  opted_out: ["expired", "archived"],
  suspended: ["active", "cancelled_by_admin", "archived"],
  cancelled_by_admin: ["archived"],
  archived: [],
};

export function canSubscriptionTransition(from: string, to: string): boolean {
  return SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Forward-looking reservation guard (v3 §5.6). After reserving a visit on
 * `visitDate`, how many of the member's remaining visits can no longer fit
 * inside the cycle given the minimum interval? Non-blocking — the goal is
 * helping members maximise their benefits, not preventing reservations.
 */
export function visitsAtRisk(input: {
  visitDate: string;      // YYYY-MM-DD of the visit being reserved
  cycleEndsOn: string;    // exclusive cycle end (YYYY-MM-DD)
  intervalDays: number;
  remainingAfterThis: number; // available visits left once this one is reserved
}): number {
  if (input.remainingAfterThis <= 0 || input.intervalDays <= 0) return 0;
  const lastUsableDay = daysBetween(input.visitDate, input.cycleEndsOn) - 1;
  if (lastUsableDay < 0) return input.remainingAfterThis;
  const fittable = Math.floor(lastUsableDay / input.intervalDays);
  return Math.max(0, input.remainingAfterThis - fittable);
}
