import { describe, expect, it } from "vitest";
import {
  capacityWarnings,
  expiryStatus,
  needsVarianceReason,
  stockLevel,
  usageVariancePercent,
  utilizationPercent,
  weeklySlotCapacity,
} from "./operations";

describe("stockLevel", () => {
  it("classifies out-of-stock, low and ok", () => {
    expect(stockLevel({ quantity_available: 0, reorder_level: 5 })).toBe("out_of_stock");
    expect(stockLevel({ quantity_available: -2, reorder_level: 0 })).toBe("out_of_stock");
    expect(stockLevel({ quantity_available: 5, reorder_level: 5 })).toBe("low_stock");
    expect(stockLevel({ quantity_available: 6, reorder_level: 5 })).toBe("ok");
  });
});

describe("expiryStatus", () => {
  const today = "2026-08-01";
  it("flags expired and expiring-soon within the warning window", () => {
    expect(expiryStatus("2026-07-31", 30, today)).toBe("expired");
    expect(expiryStatus("2026-08-15", 30, today)).toBe("expiring_soon");
    expect(expiryStatus("2026-08-31", 30, today)).toBe("expiring_soon");
    expect(expiryStatus("2026-09-15", 30, today)).toBe("ok");
    expect(expiryStatus(null, 30, today)).toBe("none");
  });
});

describe("usage variance", () => {
  it("computes percent deviation and the 25% reason threshold", () => {
    expect(usageVariancePercent(50, 55)).toBeCloseTo(10);
    expect(needsVarianceReason(50, 55)).toBe(false);
    expect(needsVarianceReason(50, 63)).toBe(true); // 26%
    expect(needsVarianceReason(0, 10)).toBe(false); // no plan → no threshold
  });
});

describe("capacity math", () => {
  const hours = [
    { day_of_week: 1, is_open: true, open_time: "09:00", close_time: "18:00" }, // 9h
    { day_of_week: 6, is_open: true, open_time: "10:00", close_time: "19:00" }, // 9h
    { day_of_week: 0, is_open: false, open_time: "12:00", close_time: "17:00" },
  ];

  it("weekly slot capacity = open spans / slot length × per-slot capacity", () => {
    // 18h open → 36 half-hour slots × 3 = 108
    expect(weeklySlotCapacity(hours, 30, 3)).toBe(108);
    expect(weeklySlotCapacity(hours, 60, 2)).toBe(36);
  });

  it("utilization handles zero capacity safely", () => {
    expect(utilizationPercent(50, 100)).toBe(50);
    expect(utilizationPercent(5, 0)).toBe(999);
    expect(utilizationPercent(0, 0)).toBe(0);
  });

  it("generates warnings at thresholds and shortages", () => {
    const w = capacityWarnings({
      utilizationPercent: 92,
      warningThreshold: 80,
      visitsRemaining: 40,
      slotsRemaining: 30,
      subscribersWithoutBookings: 5,
      activeSubscribers: 10,
    });
    const titles = w.map((x) => x.title);
    expect(titles.some((t) => /Capacity at 92%/.test(t))).toBe(true);
    expect(titles.some((t) => /exceed remaining slots/.test(t))).toBe(true);
    expect(titles.some((t) => /have not booked/.test(t))).toBe(true);
  });

  it("stays quiet when everything is healthy", () => {
    expect(
      capacityWarnings({
        utilizationPercent: 40,
        warningThreshold: 80,
        visitsRemaining: 10,
        slotsRemaining: 60,
        subscribersWithoutBookings: 1,
        activeSubscribers: 10,
      }),
    ).toHaveLength(0);
  });
});
