import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { RecommendationForm } from "@/components/admin/recommendation-form";

export const metadata: Metadata = { title: "Create Rule" };
export const dynamic = "force-dynamic";

export default async function NewRecommendationPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: plans }, { data: extras }, { data: products }] = await Promise.all([
    supabase.from("subscription_plans").select("id, name").is("archived_at", null).order("display_order"),
    supabase.from("extra_services").select("id, name").is("archived_at", null).order("display_order"),
    supabase.from("products").select("id, name").is("archived_at", null).order("display_order"),
  ]);
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Create Recommendation Rule</h1>
      <RecommendationForm
        rule={null}
        plans={plans ?? []}
        extras={extras ?? []}
        products={products ?? []}
        selected={{ targetPlanId: null, extraIds: [], productIds: [] }}
      />
    </div>
  );
}
