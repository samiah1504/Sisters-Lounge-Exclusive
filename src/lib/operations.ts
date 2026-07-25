/** Pure helpers for inventory alerts and capacity math (unit-tested). */

export interface StockLike {
  quantity_available: number;
  reorder_level: number;
  expiry_date?: string | null;
  supplier_id?: string | null;
  is_active?: boolean;
}

export type StockLevel = "out_of_stock" | "low_stock" | "ok";

export function stockLevel(item: StockLike): StockLevel {
  if (item.quantity_available <= 0) return "out_of_stock";
  if (item.quantity_available <= item.reorder_level) return "low_stock";
  return "ok";
}

export type ExpiryStatus = "expired" | "expiring_soon" | "ok" | "none";

export function expiryStatus(
  expiryDate: string | null | undefined,
  warningDays: number,
  today: string,
): ExpiryStatus {
  if (!expiryDate) return "none";
  if (expiryDate < today) return "expired";
  const ms = Date.parse(expiryDate) - Date.parse(today);
  return ms <= warningDays * 86_400_000 ? "expiring_soon" : "ok";
}

/** Percentage deviation of actual vs planned usage (0 when no plan). */
export function usageVariancePercent(planned: number, actual: number): number {
  if (planned <= 0) return 0;
  return Math.abs(actual - planned) / planned * 100;
}

export const SIGNIFICANT_VARIANCE_PERCENT = 25;

export function needsVarianceReason(planned: number, actual: number): boolean {
  return usageVariancePercent(planned, actual) > SIGNIFICANT_VARIANCE_PERCENT;
}

/* ------------------------------------------------------------- capacity --- */

export interface WeeklyHours {
  day_of_week: number;
  is_open: boolean;
  open_time: string; // HH:MM[:SS]
  close_time: string;
}

/** Bookable appointment slots per week from opening hours and settings. */
export function weeklySlotCapacity(
  hours: WeeklyHours[],
  slotMinutes: number,
  maxPerSlot: number,
): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let slots = 0;
  for (const h of hours) {
    if (!h.is_open) continue;
    const span = toMin(h.close_time) - toMin(h.open_time);
    if (span > 0 && slotMinutes > 0) slots += Math.floor(span / slotMinutes);
  }
  return slots * maxPerSlot;
}

export function utilizationPercent(demand: number, capacity: number): number {
  if (capacity <= 0) return demand > 0 ? 999 : 0;
  return Math.round((demand / capacity) * 100);
}

export interface CapacityWarning {
  severity: "notice" | "warning" | "critical";
  title: string;
  explanation: string;
  action: string;
  href: string;
}

export function capacityWarnings(input: {
  utilizationPercent: number;
  warningThreshold: number;
  visitsRemaining: number;
  slotsRemaining: number;
  homePromised: number;
  homeCapacity: number;
  subscribersWithoutBookings: number;
  activeSubscribers: number;
}): CapacityWarning[] {
  const out: CapacityWarning[] = [];
  if (input.utilizationPercent >= 90) {
    out.push({
      severity: "critical",
      title: `Capacity at ${input.utilizationPercent}%`,
      explanation: "Promised visits are close to the salon's total slot supply.",
      action: "Consider closing plans to new subscribers or extending hours.",
      href: "/admin/plans",
    });
  } else if (input.utilizationPercent >= input.warningThreshold) {
    out.push({
      severity: "warning",
      title: `Capacity above ${input.warningThreshold}%`,
      explanation: "Subscriber demand is approaching available appointment slots.",
      action: "Review plan limits before accepting many new subscribers.",
      href: "/admin/capacity",
    });
  }
  if (input.visitsRemaining > input.slotsRemaining) {
    out.push({
      severity: "critical",
      title: "Promised visits exceed remaining slots",
      explanation: `${input.visitsRemaining} visits are still owed this cycle but only ${input.slotsRemaining} bookable slots remain.`,
      action: "Add opening hours, increase per-slot capacity, or contact subscribers early.",
      href: "/admin/settings",
    });
  }
  if (input.homeCapacity > 0 && input.homePromised > input.homeCapacity) {
    out.push({
      severity: "warning",
      title: "Home-service demand above capacity",
      explanation: `${input.homePromised} home visits promised against ${input.homeCapacity} available this cycle.`,
      action: "Raise daily home-service capacity or pause home-service plans.",
      href: "/admin/settings",
    });
  }
  if (
    input.activeSubscribers > 0 &&
    input.subscribersWithoutBookings / input.activeSubscribers >= 0.4
  ) {
    out.push({
      severity: "notice",
      title: "Many subscribers have not booked",
      explanation: `${input.subscribersWithoutBookings} of ${input.activeSubscribers} active subscribers have no booking this cycle — expect end-of-cycle congestion.`,
      action: "Nudge them now via retention prompts and chat.",
      href: "/admin/retention",
    });
  }
  return out;
}
