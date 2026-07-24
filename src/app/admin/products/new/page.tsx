import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "Create Product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("display_order");
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Create Product</h1>
      <ProductForm product={null} categories={categories ?? []} />
    </div>
  );
}
