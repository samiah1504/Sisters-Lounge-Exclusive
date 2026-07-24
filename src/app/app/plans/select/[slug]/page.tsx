import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { getPlanBySlug, getPublicCategories } from "@/server/catalogue";
import { getChildren, getPendingSelection } from "@/server/customer";
import { formatNaira } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { SelectPlanForm } from "@/components/select-plan-form";

export const metadata: Metadata = { title: "Select Plan" };
export const dynamic = "force-dynamic";

export default async function SelectPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireCustomer();
  const plan = await getPlanBySlug(slug);
  if (!plan || plan.status !== "active" || !plan.is_public) notFound();

  const [childrenList, categories, existing] = await Promise.all([
    getChildren(session.customerProfile.id),
    getPublicCategories(),
    getPendingSelection(session.customerProfile.id),
  ]);
  const category = categories.find((c) => c.id === plan.category_id);
  const forChildren = plan.eligible_age_group === "children";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Select the {plan.name} plan
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your selection is saved to your account. Payment activation will be
          handled in the payments phase — nothing is charged today.
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-display text-xl text-brand-900">{plan.name}</p>
          {category && <Badge>{category.name}</Badge>}
        </div>
        <p className="mt-1 font-display text-2xl font-bold text-brand-900">
          {formatNaira(plan.monthly_price_kobo)}
          <span className="font-sans text-sm font-normal text-ink-soft"> /month</span>
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {plan.visits_included} visit{plan.visits_included > 1 ? "s" : ""} per
          monthly cycle · at least {plan.min_visit_interval_days} days apart
        </p>
      </Card>

      {existing && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm">
            You already have a pending selection. Choosing a new plan will
            replace it.
          </p>
        </Card>
      )}

      <SelectPlanForm
        planId={plan.id}
        forChildren={forChildren}
        childOptions={childrenList
          .filter((c) => c.is_active)
          .map((c) => ({ id: c.id, name: c.full_name }))}
      />
    </div>
  );
}
