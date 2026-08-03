import type { Metadata } from "next";
import Link from "next/link";
import {
  getPlanServices,
  getPublicCategories,
  getPublicPlans,
} from "@/server/catalogue";
import { formatNaira } from "@/lib/format";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Compare Memberships" };
export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ComparePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; plans?: string }>;
}) {
  const { category, plans: planFilter } = await searchParams;
  const [allPlans, categories] = await Promise.all([
    getPublicPlans(),
    getPublicCategories(),
  ]);

  const activeCategory = categories.find((c) => c.slug === category) ?? null;
  const selectedSlugs = planFilter?.split(",").filter(Boolean) ?? [];
  let plans = allPlans;
  if (selectedSlugs.length > 0) {
    plans = plans.filter((p) => selectedSlugs.includes(p.slug));
  } else if (activeCategory) {
    plans = plans.filter((p) => p.category_id === activeCategory.id);
  }
  plans = plans.slice(0, 4);

  const services = await Promise.all(plans.map((p) => getPlanServices(p.id)));

  const rows: Array<[string, (i: number) => React.ReactNode]> = [
    ["Monthly price", (i) => (
      <span className="font-bold text-brand-900">
        {formatNaira(plans[i].monthly_price_kobo)}
      </span>
    )],
    ["Visits per month", (i) => plans[i].visits_included],
    ["Minimum days between visits", (i) => plans[i].min_visit_interval_days],
    ["Location", () => "Every Sisters Lounge Salon"],
    ["Suitable for", (i) =>
      plans[i].eligible_age_group === "all"
        ? "Everyone"
        : plans[i].eligible_age_group === "adults"
          ? "Adults"
          : "Children"],
    ["Included services", (i) =>
      services[i]
        .filter((s) => s.relation === "included")
        .map((s) => s.service.name)
        .join(", ") || "—"],
    ["Excluded services", (i) =>
      services[i]
        .filter((s) => s.relation === "excluded")
        .map((s) => s.service.name)
        .join(", ") || "—"],
    ["Available days", (i) =>
      plans[i].available_days.length === 7
        ? "All open days"
        : plans[i].available_days.map((d) => DAY_NAMES[d]).join(", ")],
    ["Key terms", (i) => plans[i].eligibility_notes || plans[i].terms || "—"],
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="heading-rule font-display text-3xl text-ink">Compare Memberships</h1>
      <p className="mt-3 text-ink-soft">
        Side-by-side comparison{activeCategory ? ` — ${activeCategory.name}` : ""}.
        Unused visits always expire at cycle end on every plan.
      </p>

      {plans.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line bg-brand-50 p-8 text-center text-ink-soft">
          No plans to compare yet. <Link className="underline" href="/plans">Browse plans</Link>
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-brand-50">
                <th className="w-44 px-4 py-3 text-left font-semibold text-ink-soft">Plan</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-4 py-3 text-left">
                    <span className="font-display text-lg text-brand-700">{p.name}</span>
                    {p.is_featured && (
                      <span className="ml-2 rounded-full bg-gold-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Popular
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-soft">{label}</td>
                  {plans.map((_, i) => (
                    <td key={i} className="px-4 py-3">{cell(i)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-4 py-4" />
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-4">
                    <ButtonLink href={`/plans/${p.slug}`} variant="outline">
                      View plan
                    </ButtonLink>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
