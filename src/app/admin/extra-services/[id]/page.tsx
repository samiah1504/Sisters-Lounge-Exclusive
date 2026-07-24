import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { ExtraServiceForm } from "@/components/admin/extra-service-form";

export const metadata: Metadata = { title: "Edit Add-on" };
export const dynamic = "force-dynamic";

export default async function EditExtraServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: extras }, { data: plans }, { data: categories }, { data: planElig }, { data: catElig }] =
    await Promise.all([
      supabase.from("extra_services").select("*").eq("id", id).limit(1),
      supabase.from("subscription_plans").select("*").is("archived_at", null).order("display_order"),
      supabase.from("subscription_categories").select("*").is("archived_at", null).order("display_order"),
      supabase.from("extra_service_plan_eligibility").select("plan_id").eq("extra_service_id", id),
      supabase.from("extra_service_customer_eligibility").select("category_id").eq("extra_service_id", id),
    ]);
  const extra = extras?.[0];
  if (!extra) notFound();

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Edit: {extra.name}</h1>
      <ExtraServiceForm
        extra={extra}
        plans={plans ?? []}
        categories={categories ?? []}
        eligiblePlanIds={(planElig ?? []).map((r) => r.plan_id)}
        eligibleCategoryIds={(catElig ?? []).map((r) => r.category_id)}
      />
    </div>
  );
}
