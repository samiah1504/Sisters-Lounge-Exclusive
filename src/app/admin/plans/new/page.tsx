import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { PlanForm } from "@/components/admin/plan-form";

export const metadata: Metadata = { title: "Create Plan" };
export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: categories }, { data: services }] = await Promise.all([
    supabase.from("subscription_categories").select("*").is("archived_at", null).order("display_order"),
    supabase.from("services").select("*").is("archived_at", null).order("display_order"),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Create Plan</h1>
      <PlanForm
        plan={null}
        categories={categories ?? []}
        services={services ?? []}
        includedServiceIds={[]}
      />
    </div>
  );
}
