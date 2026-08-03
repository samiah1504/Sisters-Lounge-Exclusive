import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCategories, getPublicPlans } from "@/server/catalogue";
import { formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Subscription Plans" };
export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [categories, plans] = await Promise.all([
    getPublicCategories(),
    getPublicPlans(),
  ]);

  const activeCategory = categories.find((c) => c.slug === category) ?? null;
  const visible = activeCategory
    ? plans.filter((p) => p.category_id === activeCategory.id)
    : plans;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="heading-rule font-display text-3xl text-ink">
        Subscription Plans
      </h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Every plan runs for one monthly cycle. Visits must be at least seven
        days apart, and unused visits expire at cycle end.
      </p>

      {/* category filter */}
      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link
          href="/plans"
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${!activeCategory ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/plans?category=${c.slug}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${activeCategory?.id === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {activeCategory?.eligibility_notes && (
        <p className="mt-3 text-sm text-ink-soft">{activeCategory.eligibility_notes}</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-xl text-brand-700">{plan.name}</h2>
              <div className="flex gap-1.5">
                {plan.is_featured && <Badge tone="gold">Popular</Badge>}
                {plan.status === "closed" && <Badge tone="gray">Closed to new subscribers</Badge>}
              </div>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{plan.short_description}</p>
            <p className="mt-3 font-display text-2xl font-bold text-brand-900">
              {formatNaira(plan.monthly_price_kobo)}
              <span className="font-sans text-sm font-normal text-ink-soft"> /month</span>
            </p>
            <ul className="mt-2 grid gap-1 text-sm text-ink-soft">
              <li>✦ {plan.visits_included} visit{plan.visits_included > 1 ? "s" : ""} per month</li>
              <li>✦ Visits at least {plan.min_visit_interval_days} days apart</li>
              <li>✦ Valid at every Sisters Lounge Salon</li>
            </ul>
            <div className="mt-4 flex gap-2 pt-2">
              <ButtonLink href={`/plans/${plan.slug}`} variant="outline" className="flex-1">
                View Plan
              </ButtonLink>
            </div>
          </Card>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No plans in this category yet"
            message="New plans are added by the salon team — check another category or come back soon."
          />
        </div>
      )}

      {visible.length > 1 && (
        <div className="mt-8 text-center">
          <ButtonLink
            href={`/plans/compare${activeCategory ? `?category=${activeCategory.slug}` : ""}`}
            variant="ghost"
          >
            Compare plans side by side
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
