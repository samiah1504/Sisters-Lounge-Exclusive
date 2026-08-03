import { describe, expect, it } from "vitest";
import {
  addonTotal,
  canReschedule,
  canSubscriptionTransition,
  canTransition,
  daysBetween,
  fitsWithinHours,
  intervalConflict,
  profileCompletion,
  totalDuration,
  visitSummary,
} from "./booking-rules";

describe("daysBetween", () => {
  it("counts whole days regardless of order", () => {
    expect(daysBetween("2026-08-01", "2026-08-08")).toBe(7);
    expect(daysBetween("2026-08-08", "2026-08-01")).toBe(7);
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(0);
  });
  it("crosses month boundaries correctly", () => {
    expect(daysBetween("2026-07-30", "2026-08-02")).toBe(3);
    expect(daysBetween("2026-12-28", "2027-01-04")).toBe(7);
  });
});

describe("intervalConflict (seven-day rule)", () => {
  it("rejects a date 6 days after an existing visit", () => {
    expect(intervalConflict(["2026-08-01"], "2026-08-07", 7)).toBe("2026-08-01");
  });
  it("accepts a date exactly 7 days after", () => {
    expect(intervalConflict(["2026-08-01"], "2026-08-08", 7)).toBeNull();
  });
  it("checks every existing visit", () => {
    expect(
      intervalConflict(["2026-08-01", "2026-08-15"], "2026-08-12", 7),
    ).toBe("2026-08-15");
  });
  it("same-day duplicate always conflicts", () => {
    expect(intervalConflict(["2026-08-01"], "2026-08-01", 7)).toBe("2026-08-01");
  });
  it("respects a per-plan custom interval", () => {
    expect(intervalConflict(["2026-08-01"], "2026-08-04", 3)).toBeNull();
    expect(intervalConflict(["2026-08-01"], "2026-08-03", 3)).toBe("2026-08-01");
  });
});

describe("durations and totals", () => {
  const henna = { price_kobo: 500000, estimated_duration_minutes: 45 };
  const trim = { price_kobo: 400000, estimated_duration_minutes: 20 };

  it("adds add-on durations to the service duration", () => {
    expect(totalDuration(60, [henna, trim])).toBe(125);
    expect(totalDuration(60, [])).toBe(60);
  });
  it("sums add-on prices in kobo", () => {
    expect(addonTotal([henna, trim])).toBe(900000);
    expect(addonTotal([])).toBe(0);
  });
});

describe("fitsWithinHours", () => {
  it("accepts appointments that fit", () => {
    expect(fitsWithinHours("10:00", 120, "09:00", "18:00")).toBe(true);
  });
  it("rejects appointments running past closing", () => {
    expect(fitsWithinHours("17:00", 90, "09:00", "18:00")).toBe(false);
  });
  it("rejects starts before opening", () => {
    expect(fitsWithinHours("08:30", 30, "09:00", "18:00")).toBe(false);
  });
  it("accepts an appointment ending exactly at close", () => {
    expect(fitsWithinHours("17:00", 60, "09:00", "18:00")).toBe(true);
  });
});

describe("visitSummary", () => {
  it("computes used / reserved / remaining", () => {
    const s = visitSummary([
      { status: "consumed" },
      { status: "reserved" },
      { status: "available" },
    ]);
    expect(s).toEqual({ included: 3, used: 1, reserved: 1, remaining: 1 });
  });
  it("excludes revoked entitlements from the included count", () => {
    const s = visitSummary([{ status: "available" }, { status: "revoked" }]);
    expect(s.included).toBe(1);
    expect(s.remaining).toBe(1);
  });
  it("expired visits are neither used nor remaining", () => {
    const s = visitSummary([{ status: "expired" }, { status: "expired" }]);
    expect(s).toEqual({ included: 2, used: 0, reserved: 0, remaining: 0 });
  });
});

describe("profileCompletion", () => {
  const complete = {
    full_name: "Maryam Bello",
    phone: "+2348030000003",
    whatsapp_number: "+2348030000003",
    address: "12 Unity Road",
    city: "Ilorin",
    state: "Kwara",
    service_area_confirmed: true,
  };
  it("passes a complete profile", () => {
    expect(profileCompletion(complete)).toEqual({ complete: true, missing: [] });
  });
  it("lists every missing required field", () => {
    const r = profileCompletion({ full_name: "Maryam" });
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("WhatsApp number");
    expect(r.missing).toHaveLength(2);
  });
  it("whitespace-only values count as missing", () => {
    expect(profileCompletion({ ...complete, whatsapp_number: "  " }).complete).toBe(false);
  });
});

describe("canReschedule", () => {
  const now = new Date("2026-08-01T10:00:00+01:00");
  it("allows rescheduling before the deadline", () => {
    expect(
      canReschedule("confirmed", "2026-08-03T10:00:00+01:00", 24, now),
    ).toBe(true);
  });
  it("blocks rescheduling inside the deadline window", () => {
    expect(
      canReschedule("confirmed", "2026-08-02T09:00:00+01:00", 24, now),
    ).toBe(false);
  });
  it("blocks rescheduling for terminal statuses", () => {
    expect(canReschedule("completed", "2026-08-10T10:00:00+01:00", 24, now)).toBe(false);
    expect(canReschedule("missed", "2026-08-10T10:00:00+01:00", 24, now)).toBe(false);
  });
});

describe("status transitions", () => {
  it("appointment: allows the happy path", () => {
    expect(canTransition("pending_confirmation", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "arrived")).toBe(true);
    expect(canTransition("arrived", "completed")).toBe(true);
  });
  it("appointment: blocks completing twice or resurrecting", () => {
    expect(canTransition("completed", "in_service")).toBe(false);
    expect(canTransition("missed", "confirmed")).toBe(false);
  });
  it("subscription: paid active cycle can never be customer-cancelled", () => {
    // there is deliberately no 'cancelled_by_customer' state at all
    expect(canSubscriptionTransition("active", "archived")).toBe(false);
    expect(canSubscriptionTransition("active", "expired")).toBe(true);
  });
});
