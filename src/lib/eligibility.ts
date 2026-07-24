/**
 * Client-side eligibility mirrors of the SQL rules — used to filter what the
 * UI offers. The database re-validates everything on write.
 */

export interface ExtraServiceLike {
  id: string;
  is_active: boolean;
  archived_at?: string | null;
  salon_available: boolean;
  home_available: boolean;
  min_advance_notice_hours: number;
  /** plan ids this add-on is limited to; empty = all plans */
  eligible_plan_ids?: string[];
  /** category ids this add-on is limited to; empty = all categories */
  eligible_category_ids?: string[];
}

export function isExtraServiceEligible(
  extra: ExtraServiceLike,
  ctx: {
    planId: string;
    categoryId: string;
    location: "salon" | "home";
    startsAt?: Date;
    now?: Date;
  },
): boolean {
  if (!extra.is_active || extra.archived_at) return false;
  if (ctx.location === "home" ? !extra.home_available : !extra.salon_available)
    return false;
  const plans = extra.eligible_plan_ids ?? [];
  if (plans.length > 0 && !plans.includes(ctx.planId)) return false;
  const cats = extra.eligible_category_ids ?? [];
  if (cats.length > 0 && !cats.includes(ctx.categoryId)) return false;
  if (ctx.startsAt) {
    const now = ctx.now ?? new Date();
    const noticeMs = extra.min_advance_notice_hours * 3_600_000;
    if (ctx.startsAt.getTime() < now.getTime() + noticeMs) return false;
  }
  return true;
}

export interface ServiceLike {
  is_active: boolean;
  salon_available: boolean;
  home_available: boolean;
  eligible_age_group: "all" | "adults" | "children";
}

export function isServiceEligible(
  service: ServiceLike,
  ctx: { forChild: boolean; location: "salon" | "home" },
): boolean {
  if (!service.is_active) return false;
  if (ctx.location === "home" ? !service.home_available : !service.salon_available)
    return false;
  if (ctx.forChild && service.eligible_age_group === "adults") return false;
  if (!ctx.forChild && service.eligible_age_group === "children") return false;
  return true;
}
