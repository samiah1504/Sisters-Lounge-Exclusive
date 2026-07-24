import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { deleteRecommendationRule } from "@/server/actions/admin";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Recommendations" };
export const dynamic = "force-dynamic";

export default async function AdminRecommendationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("recommendation_rules")
    .select("*, targets:recommendation_targets(target_type, target_id), items:recommendation_items(item_type, item_id)")
    .order("priority", { ascending: false });

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Recommendation Rules</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Rule-based upselling — configure what gets suggested where. No AI.
          </p>
        </div>
        <ButtonLink href="/admin/recommendations/new">Create rule</ButtonLink>
      </div>

      {(rules ?? []).length === 0 ? (
        <EmptyState title="No rules" message="Create your first recommendation rule." />
      ) : (
        <div className="grid gap-2.5">
          {(rules ?? []).map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {r.name}
                  {r.badge_label && <Badge tone="gold">{r.badge_label}</Badge>}
                </p>
                <p className="text-sm text-ink-soft">
                  Context: {r.context.replace(/_/g, " ")} · priority {r.priority} ·{" "}
                  {(r.targets as Array<{ target_type: string }>).map((t) => t.target_type).join(", ") || "all"} ·{" "}
                  {(r.items as Array<unknown>).length} item{(r.items as Array<unknown>).length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Off"}</Badge>
                <Link className="text-sm font-semibold text-brand-600 hover:underline" href={`/admin/recommendations/${r.id}`}>
                  Edit
                </Link>
                <form action={deleteRecommendationRule.bind(null, r.id)}>
                  <button className="text-sm font-semibold text-red-700 hover:underline">Delete</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
