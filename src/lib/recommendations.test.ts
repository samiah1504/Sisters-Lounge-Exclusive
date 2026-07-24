import { describe, expect, it } from "vitest";
import {
  resolveRecommendations,
  ruleMatches,
  type RecommendationRule,
} from "./recommendations";

const rule = (over: Partial<RecommendationRule>): RecommendationRule => ({
  id: "r1",
  context: "booking",
  is_active: true,
  priority: 0,
  badge_label: null,
  targets: [],
  items: [],
  ...over,
});

describe("ruleMatches", () => {
  it("matches on context with no targets (open rule)", () => {
    expect(ruleMatches(rule({}), { context: "booking" })).toBe(true);
    expect(ruleMatches(rule({}), { context: "plan_detail" })).toBe(false);
  });

  it("inactive rules never match", () => {
    expect(ruleMatches(rule({ is_active: false }), { context: "booking" })).toBe(false);
  });

  it("plan-targeted rules require the matching plan", () => {
    const r = rule({ targets: [{ target_type: "plan", target_id: "p1" }] });
    expect(ruleMatches(r, { context: "booking", planId: "p1" })).toBe(true);
    expect(ruleMatches(r, { context: "booking", planId: "p2" })).toBe(false);
    expect(ruleMatches(r, { context: "booking" })).toBe(false);
  });

  it("'all' target matches any subject", () => {
    const r = rule({ targets: [{ target_type: "all", target_id: null }] });
    expect(ruleMatches(r, { context: "booking" })).toBe(true);
  });
});

describe("resolveRecommendations", () => {
  it("orders by rule priority then item order, deduplicating items", () => {
    const low = rule({
      id: "low",
      priority: 1,
      badge_label: "Customers often add",
      items: [
        { item_type: "extra_service", item_id: "henna", display_order: 1 },
        { item_type: "extra_service", item_id: "trim", display_order: 2 },
      ],
    });
    const high = rule({
      id: "high",
      priority: 10,
      badge_label: "Recommended for this visit",
      items: [{ item_type: "extra_service", item_id: "henna", display_order: 1 }],
    });
    const out = resolveRecommendations([low, high], { context: "booking" });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      item_id: "henna",
      badge_label: "Recommended for this visit", // higher-priority badge wins
    });
    expect(out[1]).toMatchObject({ item_id: "trim" });
  });

  it("returns nothing when no rule matches the context", () => {
    const r = rule({ context: "post_appointment", items: [
      { item_type: "product", item_id: "oil", display_order: 1 },
    ]});
    expect(resolveRecommendations([r], { context: "booking" })).toHaveLength(0);
  });
});
