import { describe, expect, it } from "vitest";
import { isExtraServiceEligible, isServiceEligible } from "./eligibility";

const base = {
  id: "x1",
  is_active: true,
  archived_at: null,
  salon_available: true,
  home_available: false,
  min_advance_notice_hours: 0,
};

describe("isExtraServiceEligible", () => {
  const ctx = {
    planId: "plan-1",
    categoryId: "cat-adult",
    location: "salon" as const,
  };

  it("open eligibility (no restrictions) matches everyone", () => {
    expect(isExtraServiceEligible(base, ctx)).toBe(true);
  });

  it("inactive or archived add-ons never match", () => {
    expect(isExtraServiceEligible({ ...base, is_active: false }, ctx)).toBe(false);
    expect(
      isExtraServiceEligible({ ...base, archived_at: "2026-01-01" }, ctx),
    ).toBe(false);
  });

  it("location availability is enforced", () => {
    expect(
      isExtraServiceEligible(base, { ...ctx, location: "home" }),
    ).toBe(false);
    expect(
      isExtraServiceEligible({ ...base, home_available: true }, { ...ctx, location: "home" }),
    ).toBe(true);
  });

  it("plan restriction blocks other plans", () => {
    const restricted = { ...base, eligible_plan_ids: ["plan-2"] };
    expect(isExtraServiceEligible(restricted, ctx)).toBe(false);
    expect(
      isExtraServiceEligible(restricted, { ...ctx, planId: "plan-2" }),
    ).toBe(true);
  });

  it("customer-category restriction blocks other categories", () => {
    const adultsOnly = { ...base, eligible_category_ids: ["cat-adult"] };
    expect(isExtraServiceEligible(adultsOnly, ctx)).toBe(true);
    expect(
      isExtraServiceEligible(adultsOnly, { ...ctx, categoryId: "cat-kids" }),
    ).toBe(false);
  });

  it("advance-notice requirement is enforced against the start time", () => {
    const now = new Date("2026-08-01T10:00:00+01:00");
    const colouring = { ...base, min_advance_notice_hours: 48 };
    expect(
      isExtraServiceEligible(colouring, {
        ...ctx,
        startsAt: new Date("2026-08-02T10:00:00+01:00"),
        now,
      }),
    ).toBe(false);
    expect(
      isExtraServiceEligible(colouring, {
        ...ctx,
        startsAt: new Date("2026-08-04T10:00:00+01:00"),
        now,
      }),
    ).toBe(true);
  });
});

describe("isServiceEligible", () => {
  const svc = {
    is_active: true,
    salon_available: true,
    home_available: true,
    eligible_age_group: "all" as const,
  };

  it("age groups are enforced both ways", () => {
    expect(
      isServiceEligible({ ...svc, eligible_age_group: "adults" }, { forChild: true, location: "salon" }),
    ).toBe(false);
    expect(
      isServiceEligible({ ...svc, eligible_age_group: "children" }, { forChild: false, location: "salon" }),
    ).toBe(false);
    expect(
      isServiceEligible({ ...svc, eligible_age_group: "children" }, { forChild: true, location: "salon" }),
    ).toBe(true);
  });

  it("location availability is enforced", () => {
    expect(
      isServiceEligible({ ...svc, home_available: false }, { forChild: false, location: "home" }),
    ).toBe(false);
  });
});
