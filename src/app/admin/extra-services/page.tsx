import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { archiveExtraService } from "@/server/actions/admin";
import { formatDuration, formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Extra Services" };
export const dynamic = "force-dynamic";

export default async function AdminExtraServicesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: extras } = await supabase
    .from("extra_services")
    .select("*, plan_elig:extra_service_plan_eligibility(plan_id), cat_elig:extra_service_customer_eligibility(category_id)")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Extra Services</h1>
          <p className="mt-2 text-sm text-ink-soft">
            The upselling catalogue — add-ons customers attach to their visits.
          </p>
        </div>
        <ButtonLink href="/admin/extra-services/new">Create add-on</ButtonLink>
      </div>

      <div className="grid gap-2.5">
        {(extras ?? []).map((e) => (
          <Card key={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {e.name}
                  {e.is_featured && <Badge tone="gold">Featured</Badge>}
                </p>
                <p className="text-sm text-ink-soft">
                  {formatNaira(e.price_kobo)} · {formatDuration(e.estimated_duration_minutes)} ·{" "}
                  {e.payment_requirement.replace(/_/g, " ")}
                  {e.min_advance_notice_hours > 0 && ` · ${e.min_advance_notice_hours}h notice`}
                </p>
                <p className="text-xs text-ink-soft">
                  {(e.plan_elig as Array<unknown>).length === 0
                    ? "All plans"
                    : `${(e.plan_elig as Array<unknown>).length} plan(s)`}
                  {" · "}
                  {(e.cat_elig as Array<unknown>).length === 0
                    ? "all categories"
                    : `${(e.cat_elig as Array<unknown>).length} categor${(e.cat_elig as Array<unknown>).length > 1 ? "ies" : "y"}`}
                  {" · "}
                  {[e.salon_available && "salon", e.home_available && "home"].filter(Boolean).join(" + ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {e.archived_at ? (
                  <Badge tone="gray">Archived</Badge>
                ) : e.is_active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="amber">Hidden</Badge>
                )}
                <Link className="text-sm font-semibold text-brand-600 hover:underline" href={`/admin/extra-services/${e.id}`}>
                  Edit
                </Link>
                <form action={archiveExtraService.bind(null, e.id, !e.archived_at)}>
                  <button className="text-sm font-semibold text-red-700 hover:underline">
                    {e.archived_at ? "Restore" : "Archive"}
                  </button>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
