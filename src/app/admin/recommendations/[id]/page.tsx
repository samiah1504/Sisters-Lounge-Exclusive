import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { RecommendationForm } from "@/components/admin/recommendation-form";

export const metadata: Metadata = { title: "Edit Rule" };
export const dynamic = "force-dynamic";

export default async function EditRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: rules }, { data: plans }, { data: extras }, { data: products }] =
    await Promise.all([
      supabase
        .from("recommendation_rules")
        .select("*, targets:recommendation_targets(target_type, target_id), items:recommendation_items(item_type, item_id)")
        .eq("id", id)
        .limit(1),
      supabase.from("subscription_plans").select("id, name").is("archived_at", null).order("display_order"),
      supabase.from("extra_services").select("id, name").is("archived_at", null).order("display_order"),
      supabase.from("products").select("id, name").is("archived_at", null).order("display_order"),
    ]);
  const rule = rules?.[0];
  if (!rule) notFound();

  const targets = rule.targets as Array<{ target_type: string; target_id: string | null }>;
  const items = rule.items as Array<{ item_type: string; item_id: string }>;

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Edit: {rule.name}</h1>
      <RecommendationForm
        rule={rule}
        plans={plans ?? []}
        extras={extras ?? []}
        products={products ?? []}
        selected={{
          targetPlanId: targets.find((t) => t.target_type === "plan")?.target_id ?? null,
          extraIds: items.filter((i) => i.item_type === "extra_service").map((i) => i.item_id),
          productIds: items.filter((i) => i.item_type === "product").map((i) => i.item_id),
        }}
      />
    </div>
  );
}
