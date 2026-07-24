import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { PlanForm } from "@/components/admin/plan-form";
import { formatNaira, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Edit Plan" };
export const dynamic = "force-dynamic";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: plans }, { data: categories }, { data: services }, { data: rels }, { data: versions }] =
    await Promise.all([
      supabase.from("subscription_plans").select("*").eq("id", id).limit(1),
      supabase.from("subscription_categories").select("*").is("archived_at", null).order("display_order"),
      supabase.from("services").select("*").is("archived_at", null).order("display_order"),
      supabase.from("subscription_plan_services").select("service_id").eq("plan_id", id).eq("relation", "included"),
      supabase.from("subscription_plan_versions").select("*").eq("plan_id", id).order("version_number", { ascending: false }).limit(6),
    ]);
  const plan = plans?.[0];
  if (!plan) notFound();

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Edit: {plan.name}</h1>
      <PlanForm
        plan={plan}
        categories={categories ?? []}
        services={services ?? []}
        includedServiceIds={(rels ?? []).map((r) => r.service_id)}
      />
      <Card>
        <p className="font-semibold">Version history (immutable snapshots)</p>
        <ul className="mt-2 grid gap-1.5 text-sm text-ink-soft">
          {(versions ?? []).map((v) => (
            <li key={v.id}>
              v{v.version_number} · {formatNaira(v.monthly_price_kobo)}/month ·{" "}
              {v.visits_included} visits · interval {v.min_visit_interval_days}d ·{" "}
              {formatDate(v.created_at)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">
          Material changes (price, visits, interval, terms) create a new
          version automatically. Existing subscriptions keep the version they
          were sold under.
        </p>
      </Card>
    </div>
  );
}
