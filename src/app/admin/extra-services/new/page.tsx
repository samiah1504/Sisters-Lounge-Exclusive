import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { ExtraServiceForm } from "@/components/admin/extra-service-form";

export const metadata: Metadata = { title: "Create Add-on" };
export const dynamic = "force-dynamic";

export default async function NewExtraServicePage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: plans }, { data: categories }] = await Promise.all([
    supabase.from("subscription_plans").select("*").is("archived_at", null).order("display_order"),
    supabase.from("subscription_categories").select("*").is("archived_at", null).order("display_order"),
  ]);
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Create Extra Service</h1>
      <ExtraServiceForm
        extra={null}
        plans={plans ?? []}
        categories={categories ?? []}
        eligiblePlanIds={[]}
        eligibleCategoryIds={[]}
      />
    </div>
  );
}
