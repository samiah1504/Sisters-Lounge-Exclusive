import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { archiveProduct } from "@/server/actions/admin";
import { formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, category:product_categories(name)")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="heading-rule font-display text-2xl text-ink">Products</h1>
        <ButtonLink href="/admin/products/new">Create product</ButtonLink>
      </div>
      <p className="text-sm text-ink-soft">
        Catalogue only in this phase — no cart, checkout or delivery.
      </p>

      <div className="grid gap-2.5">
        {(products ?? []).map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {p.name} <span className="text-sm font-normal text-ink-soft">· {p.sku}</span>
                {p.is_featured && <Badge tone="gold">Featured</Badge>}
              </p>
              <p className="text-sm text-ink-soft">
                {formatNaira(p.price_kobo)}
                {p.subscriber_price_kobo != null && ` · subscriber ${formatNaira(p.subscriber_price_kobo)}`}
                {" · "}{(p.category as { name: string } | null)?.name ?? "uncategorised"}
                {" · "}{p.stock_status.replace(/_/g, " ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {p.archived_at ? (
                <Badge tone="gray">Archived</Badge>
              ) : p.is_active ? (
                <Badge tone="green">Active</Badge>
              ) : (
                <Badge tone="amber">Hidden</Badge>
              )}
              <Link className="text-sm font-semibold text-brand-600 hover:underline" href={`/admin/products/${p.id}`}>
                Edit
              </Link>
              <form action={archiveProduct.bind(null, p.id, !p.archived_at)}>
                <button className="text-sm font-semibold text-red-700 hover:underline">
                  {p.archived_at ? "Restore" : "Archive"}
                </button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
