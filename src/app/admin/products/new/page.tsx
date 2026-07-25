import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "Create Product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: categories }, { data: inventoryItems }] = await Promise.all([
    supabase.from("product_categories").select("id, name").order("display_order"),
    supabase.from("inventory_items").select("id, name, sku")
      .eq("item_type", "retail").eq("is_active", true).order("name"),
  ]);
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Create Product</h1>
      <ProductForm product={null} categories={categories ?? []}
        inventoryItems={inventoryItems ?? []} />
    </div>
  );
}
