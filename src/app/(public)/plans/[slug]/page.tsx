import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPlanBySlug,
  getPlanServices,
  getPublicCategories,
} from "@/server/catalogue";
import { getSession } from "@/server/auth";
import { formatDuration, formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const plan = await getPlanBySlug(slug);
  return { title: plan ? `${plan.name} Plan` : "Plan" };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const plan = await getPlanBySlug(slug);
  if (!plan || !["active", "closed"].includes(plan.status)) notFound();

  const [services, categories, session] = await Promise.all([
    getPlanServices(plan.id),
    getPublicCategories(),
    getSession(),
  ]);
  const category = categories.find((c) => c.id === plan.category_id);
  const included = services.filter((s) => ["included", "optional"].includes(s.relation));
  const excluded = services.filter((s) => s.relation === "excluded");
  const closed = plan.status === "closed";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-2">
        {category && <Badge>{category.name}</Badge>}
        {plan.tier_label && <Badge tone="gold">{plan.tier_label}</Badge>}
        {closed && <Badge tone="gray">Closed to new subscribers</Badge>}
      </div>
      <h1 className="mt-3 font-display text-3xl text-brand-900">{plan.name}</h1>
      <p className="mt-2 text-ink-soft">
        {plan.full_description || plan.short_description}
      </p>

      <Card className="mt-5">
        <p className="font-display text-3xl font-bold text-brand-900">
          {formatNaira(plan.monthly_price_kobo)}
          <span className="font-sans text-sm font-normal text-ink-soft"> /month</span>
        </p>
        <ul className="mt-3 grid gap-1.5 text-[15px] text-ink-soft">
          <li>✦ {plan.visits_included} salon visit{plan.visits_included > 1 ? "s" : ""} each monthly cycle</li>
          <li>✦ Visits must be at least {plan.min_visit_interval_days} days apart</li>
          <li>✦ Valid at every Sisters Lounge Salon</li>
          <li>
            ✦ Available days:{" "}
            {plan.available_days.length === 7
              ? "every open day, including weekends"
              : plan.available_days.map((d) => DAY_NAMES[d]).join(", ")}
          </li>
          {plan.eligibility_notes && <li>✦ {plan.eligibility_notes}</li>}
        </ul>
      </Card>

      {included.length > 0 && (
        <section className="mt-6">
          <h2 className="heading-rule font-display text-xl">What&apos;s included</h2>
          <ul className="mt-3 grid gap-2">
            {included.map(({ service, relation }) => (
              <li key={service.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
                <div>
                  <p className="font-semibold">{service.name}</p>
                  <p className="text-sm text-ink-soft">
                    {formatDuration(service.estimated_duration_minutes)}
                    {relation === "optional" ? " · optional" : ""}
                  </p>
                </div>
                <Badge tone={relation === "included" ? "green" : "gray"}>
                  {relation === "included" ? "Included" : "Optional"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {excluded.length > 0 && (
        <section className="mt-6">
          <h2 className="heading-rule font-display text-xl">Not included</h2>
          <ul className="mt-3 grid gap-2">
            {excluded.map(({ service }) => (
              <li key={service.id} className="rounded-xl border border-line bg-white px-4 py-3 text-ink-soft">
                {service.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="heading-rule font-display text-xl">Important terms</h2>
        <ul className="mt-3 grid gap-1.5 rounded-xl border border-line bg-white p-4 text-sm text-ink-soft">
          <li>• Every subscription lasts one monthly cycle.</li>
          <li>• Unused visits expire at the end of the cycle and cannot roll over.</li>
          <li>• An already-paid active cycle cannot be cancelled, and subscriptions cannot be paused.</li>
          <li>• You can opt out of the next renewal at any time.</li>
          <li>• Plan changes take effect from your next cycle.</li>
          <li>• Missed appointments do not automatically consume a visit.</li>
          <li>• Stylists are assigned by the salon.</li>
          {plan.terms && <li>• {plan.terms}</li>}
        </ul>
      </section>

      <div className="sticky bottom-4 mt-8 rounded-2xl border border-line bg-white p-3 shadow-card">
        {closed ? (
          <p className="px-2 py-1.5 text-center text-sm text-ink-soft">
            This plan is currently closed to new subscribers.
          </p>
        ) : session?.profile.role === "customer" ? (
          <ButtonLink href={`/app/plans/select/${plan.slug}`} className="w-full">
            Select this plan
          </ButtonLink>
        ) : (
          <ButtonLink href={`/register`} className="w-full">
            Create an account to select this plan
          </ButtonLink>
        )}
        <p className="mt-2 text-center text-xs text-ink-soft">
          Selection is saved to your account — payment activation arrives in the
          payments phase.
        </p>
      </div>
    </div>
  );
}
