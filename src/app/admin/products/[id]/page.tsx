import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "Edit Product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).limit(1),
    supabase.from("product_categories").select("id, name").order("display_order"),
  ]);
  const product = products?.[0];
  if (!product) notFound();
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Edit: {product.name}</h1>
      <ProductForm product={product} categories={categories ?? []} />
    </div>
  );
}
