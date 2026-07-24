import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import { getPublicProducts } from "@/server/catalogue";
import { getFavourites, getRecommendationRules } from "@/server/customer";
import { createClient } from "@/lib/supabase/server";
import { resolveRecommendations } from "@/lib/recommendations";
import { formatNaira } from "@/lib/format";
import { ArtBlock, Badge, Card, EmptyState } from "@/components/ui";
import { FavouriteButton } from "@/components/favourite-button";
import Link from "next/link";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const session = await requireCustomer();
  const supabase = await createClient();
  const [products, favourites, rules, { data: categories }, { data: activeSub }] =
    await Promise.all([
      getPublicProducts(),
      getFavourites(session.customerProfile.id),
      getRecommendationRules(),
      supabase.from("product_categories").select("*").eq("is_active", true).order("display_order"),
      supabase
        .from("subscriptions")
        .select("id")
        .eq("customer_id", session.customerProfile.id)
        .in("status", ["active", "expiring_soon", "renewal_due"])
        .limit(1),
    ]);

  const isSubscriber = (activeSub?.length ?? 0) > 0;
  const favouriteIds = new Set(
    favourites.filter((f) => f.item_type === "product").map((f) => f.item_id),
  );
  const recommended = new Map(
    resolveRecommendations(rules, { context: "product_catalogue" })
      .filter((r) => r.item_type === "product")
      .map((r) => [r.item_id, r.badge_label]),
  );

  const activeCategory = categories?.find((c) => c.slug === category) ?? null;
  let visible = products;
  if (activeCategory) visible = visible.filter((p) => p.category_id === activeCategory.id);
  if (q) {
    const needle = q.toLowerCase();
    visible = visible.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.short_description.toLowerCase().includes(needle),
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Products</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Stylist-recommended hair care. Online checkout arrives in the
          payments phase — save favourites for now and buy in the salon.
        </p>
      </div>

      <form className="flex gap-2" action="/app/products" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search products…"
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-600"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button className="rounded-xl bg-brand-600 px-4 font-semibold text-white">
          Search
        </button>
      </form>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link
          href="/app/products"
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${!activeCategory ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
        >
          All
        </Link>
        {(categories ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/app/products?category=${c.slug}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${activeCategory?.id === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No products found"
          message={q ? `Nothing matched “${q}”.` : "Products are being added — check back soon."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((p) => {
            const badge = recommended.get(p.id);
            const subscriberPrice =
              isSubscriber && p.subscriber_price_kobo != null &&
              p.subscriber_price_kobo < p.price_kobo
                ? p.subscriber_price_kobo
                : null;
            return (
              <Card key={p.id} className="relative flex flex-col p-3">
                <div className="absolute right-2 top-2 z-10">
                  <FavouriteButton
                    itemType="product"
                    itemId={p.id}
                    isFavourite={favouriteIds.has(p.id)}
                  />
                </div>
                <Link href={`/app/products/${p.slug}`} className="flex flex-1 flex-col">
                  <ArtBlock seed={p.slug} className="h-24" />
                  {badge && (
                    <span className="mt-2 self-start rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-700">
                      {badge}
                    </span>
                  )}
                  <p className="mt-2 text-[15px] font-semibold leading-snug">{p.name}</p>
                  <p className="mt-auto pt-1 text-sm">
                    {subscriberPrice != null ? (
                      <>
                        <span className="font-bold text-brand-700">{formatNaira(subscriberPrice)}</span>{" "}
                        <span className="text-xs text-ink-soft line-through">{formatNaira(p.price_kobo)}</span>
                      </>
                    ) : (
                      <span className="font-bold text-brand-700">{formatNaira(p.price_kobo)}</span>
                    )}
                  </p>
                  {p.stock_status !== "in_stock" && (
                    <Badge tone={p.stock_status === "low_stock" ? "amber" : "red"}>
                      {p.stock_status === "low_stock" ? "Low stock" : "Out of stock"}
                    </Badge>
                  )}
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
