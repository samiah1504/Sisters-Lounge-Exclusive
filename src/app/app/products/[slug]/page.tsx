import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { getPublicProducts } from "@/server/catalogue";
import { getFavourites } from "@/server/customer";
import { formatNaira } from "@/lib/format";
import { ArtBlock, Badge, Card } from "@/components/ui";
import { FavouriteButton } from "@/components/favourite-button";

export const metadata: Metadata = { title: "Product" };
export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireCustomer();
  const [products, favourites] = await Promise.all([
    getPublicProducts(),
    getFavourites(session.customerProfile.id),
  ]);
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  const isFavourite = favourites.some(
    (f) => f.item_type === "product" && f.item_id === product.id,
  );

  return (
    <div className="grid gap-4">
      <ArtBlock seed={product.slug} className="h-44" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{product.name}</h1>
          <p className="mt-1 text-lg font-bold text-brand-700">
            {formatNaira(product.price_kobo)}
            {product.subscriber_price_kobo != null &&
              product.subscriber_price_kobo < product.price_kobo && (
                <span className="ml-2 text-sm font-normal text-emerald-700">
                  {formatNaira(product.subscriber_price_kobo)} for members
                </span>
              )}
          </p>
        </div>
        <FavouriteButton
          itemType="product"
          itemId={product.id}
          isFavourite={isFavourite}
        />
      </div>

      <p className="text-ink-soft">{product.full_description || product.short_description}</p>

      <div className="flex flex-wrap gap-2">
        <Badge tone={product.stock_status === "in_stock" ? "green" : product.stock_status === "low_stock" ? "amber" : "red"}>
          {product.stock_status.replace(/_/g, " ")}
        </Badge>
        {product.age_suitability !== "all" && (
          <Badge tone="gray">For {product.age_suitability}</Badge>
        )}
        {product.hair_type_suitability && (
          <Badge tone="brand">{product.hair_type_suitability}</Badge>
        )}
      </div>

      {product.usage_instructions && (
        <Card>
          <p className="font-semibold">How to use</p>
          <p className="mt-1 text-sm text-ink-soft">{product.usage_instructions}</p>
        </Card>
      )}
      {product.ingredients && (
        <Card>
          <p className="font-semibold">Ingredients</p>
          <p className="mt-1 text-sm text-ink-soft">{product.ingredients}</p>
        </Card>
      )}
      {product.warnings && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-semibold">Please note</p>
          <p className="mt-1 text-sm text-ink-soft">{product.warnings}</p>
        </Card>
      )}

      <Card className="border-dashed text-center">
        <p className="text-sm text-ink-soft">
          Online checkout opens in the payments phase. For now, mention this
          product at your next visit or save it to favourites.
        </p>
      </Card>
    </div>
  );
}
