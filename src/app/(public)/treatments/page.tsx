import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getPublicExtraServices,
  getPublicPlans,
  getServices,
} from "@/server/catalogue";
import { formatDuration, formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Treatments" };
export const dynamic = "force-dynamic";

/** v3 §6.4 — public treatment pages: what each involves, duration, which
 *  memberships include it, and add-on prices where purchasable on top. */
export default async function TreatmentsPage() {
  const [services, plans, extras, rels] = await Promise.all([
    getServices(),
    getPublicPlans(),
    getPublicExtraServices(),
    (async () => {
      if (!isSupabaseConfigured()) return [];
      const supabase = await createClient();
      const { data } = await supabase.from("subscription_plan_services").select("*");
      return data ?? [];
    })(),
  ]);
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  const includedIn = (serviceId: string) =>
    [...new Set(
      (rels ?? [])
        .filter((r) => r.service_id === serviceId &&
          ["included", "optional"].includes(r.relation))
        .map((r) => planName.get(r.plan_id))
        .filter(Boolean),
    )] as string[];
  // A plan with no explicit inclusions accepts every active service.
  const openPlans = plans
    .filter((p) => !(rels ?? []).some(
      (r) => r.plan_id === p.id && r.relation === "included"))
    .map((p) => p.name);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">Treatments</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Professional care designed for natural hair. Every treatment below is
        delivered by a Sisters Lounge stylist as part of a membership visit.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {services.map((s) => {
          const inPlans = [...new Set([...includedIn(s.id), ...openPlans])];
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg text-brand-900">{s.name}</h2>
                <Badge tone="brand">{formatDuration(s.estimated_duration_minutes)}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{s.description}</p>
              {inPlans.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-ink-soft">Included with: </span>
                  <span className="font-semibold text-brand-700">
                    {inPlans.join(", ")}
                  </span>
                </p>
              )}
              {s.eligible_age_group !== "all" && (
                <p className="mt-1 text-xs text-ink-soft">
                  For {s.eligible_age_group} only.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 font-display text-2xl text-ink">Add-on services</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Members can add these to any reserved visit for an additional fee.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {extras.map((e) => (
          <Card key={e.id}>
            <p className="font-semibold">{e.name}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{e.short_description}</p>
            <p className="mt-1.5 text-sm">
              <span className="font-bold text-brand-700">{formatNaira(e.price_kobo)}</span>
              <span className="text-ink-soft"> · +{formatDuration(e.estimated_duration_minutes)}</span>
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <ButtonLink href="/plans">See Which Membership Fits You</ButtonLink>
      </div>
    </div>
  );
}
