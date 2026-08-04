import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveConsultationBenefit } from "@/server/actions/admin";
import { PlanForm } from "@/components/admin/plan-form";
import { ActionForm } from "@/components/action-form";
import { formatNaira, formatDate } from "@/lib/format";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

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
  const [{ data: plans }, { data: categories }, { data: services }, { data: rels }, { data: versions }, { data: consultTypes }, { data: benefits }] =
    await Promise.all([
      supabase.from("subscription_plans").select("*").eq("id", id).limit(1),
      supabase.from("subscription_categories").select("*").is("archived_at", null).order("display_order"),
      supabase.from("services").select("*").is("archived_at", null).order("display_order"),
      supabase.from("subscription_plan_services").select("service_id").eq("plan_id", id).eq("relation", "included"),
      supabase.from("subscription_plan_versions").select("*").eq("plan_id", id).order("version_number", { ascending: false }).limit(6),
      supabase.from("consultation_types").select("id, name, price_kobo").eq("is_active", true).order("display_order"),
      supabase.from("plan_consultation_benefits").select("*").eq("plan_id", id),
    ]);
  const plan = plans?.[0];
  if (!plan) notFound();
  const benefitOf = new Map(((benefits ?? []) as Row[]).map((b) => [b.consultation_type_id, b]));

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Edit: {plan.name}</h1>
      <PlanForm
        plan={plan}
        categories={categories ?? []}
        services={services ?? []}
        includedServiceIds={(rels ?? []).map((r) => r.service_id)}
      />
      {/* v3 C2 — Expert Consultation benefits on this membership */}
      <Card>
        <p className="font-semibold">Expert Consultation benefits</p>
        <p className="mt-1 text-sm text-ink-soft">
          What members on this plan pay for each Expert Consultation:
          included free (capped per cycle), a member price, or the standard
          price. The member&apos;s consultation page reflects this
          automatically.
        </p>
        <div className="mt-3 grid gap-2.5">
          {((consultTypes ?? []) as Row[]).map((t) => {
            const b = benefitOf.get(t.id);
            return (
              <details key={t.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="font-medium">
                    {t.name}
                    <span className="ml-2 text-sm text-ink-soft">
                      standard {formatNaira(t.price_kobo)}
                    </span>
                  </span>
                  <Badge tone={b?.benefit_type === "included" ? "green" : b ? "gold" : "gray"}>
                    {b?.benefit_type === "included"
                      ? `included ×${b.included_per_cycle}/cycle`
                      : b
                        ? `member ${formatNaira(b.member_price_kobo)}`
                        : "standard"}
                  </Badge>
                </summary>
                <div className="mt-3">
                  <ActionForm
                    action={saveConsultationBenefit.bind(null, plan.id, t.id)}
                    submitLabel="Save benefit"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Benefit" htmlFor={`b-${t.id}`}>
                        <select id={`b-${t.id}`} name="benefit"
                          defaultValue={b?.benefit_type ?? "standard"} className={inputClass}>
                          <option value="standard">Standard price</option>
                          <option value="included">Included with membership</option>
                          <option value="discounted">Member price</option>
                        </select>
                      </Field>
                      <Field label="Included per cycle" htmlFor={`c-${t.id}`}
                        hint="Only for included benefits.">
                        <input id={`c-${t.id}`} name="included_per_cycle" type="number"
                          min={1} max={31} defaultValue={b?.included_per_cycle ?? 1}
                          className={inputClass} />
                      </Field>
                      <Field label="Member price (₦)" htmlFor={`p-${t.id}`}
                        hint="Only for member-price benefits.">
                        <input id={`p-${t.id}`} name="member_price_naira" type="number"
                          min={0} step="0.01"
                          defaultValue={b?.member_price_kobo ? b.member_price_kobo / 100 : ""}
                          className={inputClass} />
                      </Field>
                    </div>
                  </ActionForm>
                </div>
              </details>
            );
          })}
        </div>
      </Card>

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
