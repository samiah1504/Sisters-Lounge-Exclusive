/**
 * Rule-based recommendation matching (NOT AI). Rules are configured by
 * admins; this module resolves which rule items apply in a given context.
 */

export type RecommendationContext =
  | "plan_detail"
  | "booking"
  | "booking_confirmation"
  | "upcoming_appointment"
  | "post_appointment"
  | "product_catalogue";

export interface RecommendationRule {
  id: string;
  context: RecommendationContext;
  is_active: boolean;
  priority: number;
  badge_label: string | null;
  targets: Array<{
    target_type: "plan" | "service" | "category" | "all";
    target_id: string | null;
  }>;
  items: Array<{
    item_type: "extra_service" | "product";
    item_id: string;
    display_order: number;
  }>;
}

export interface MatchContext {
  context: RecommendationContext;
  planId?: string;
  serviceId?: string;
  categoryId?: string;
}

export function ruleMatches(rule: RecommendationRule, ctx: MatchContext): boolean {
  if (!rule.is_active || rule.context !== ctx.context) return false;
  if (rule.targets.length === 0) return true;
  return rule.targets.some((t) => {
    switch (t.target_type) {
      case "all":
        return true;
      case "plan":
        return !!ctx.planId && t.target_id === ctx.planId;
      case "service":
        return !!ctx.serviceId && t.target_id === ctx.serviceId;
      case "category":
        return !!ctx.categoryId && t.target_id === ctx.categoryId;
    }
  });
}

export interface ResolvedRecommendation {
  item_type: "extra_service" | "product";
  item_id: string;
  badge_label: string | null;
  priority: number;
}

/**
 * Resolve recommended items for a context: matching rules, highest priority
 * first, de-duplicated by item (first badge wins).
 */
export function resolveRecommendations(
  rules: RecommendationRule[],
  ctx: MatchContext,
): ResolvedRecommendation[] {
  const seen = new Set<string>();
  const out: ResolvedRecommendation[] = [];
  const matching = rules
    .filter((r) => ruleMatches(r, ctx))
    .sort((a, b) => b.priority - a.priority);
  for (const rule of matching) {
    const items = [...rule.items].sort((a, b) => a.display_order - b.display_order);
    for (const item of items) {
      const key = `${item.item_type}:${item.item_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        item_type: item.item_type,
        item_id: item.item_id,
        badge_label: rule.badge_label,
        priority: rule.priority,
      });
    }
  }
  return out;
}
