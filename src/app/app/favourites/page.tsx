import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/server/auth";
import {
  getConsultationTypes,
  getPublicExtraServices,
  getPublicProducts,
} from "@/server/catalogue";
import { getFavourites } from "@/server/customer";
import { formatNaira } from "@/lib/format";
import { ArtBlock, Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { FavouriteButton } from "@/components/favourite-button";

export const metadata: Metadata = { title: "My Favourites" };
export const dynamic = "force-dynamic";

export default async function FavouritesPage() {
  const session = await requireCustomer();
  const [favourites, products, extras, consultations] = await Promise.all([
    getFavourites(session.customerProfile.id),
    getPublicProducts(),
    getPublicExtraServices(),
    getConsultationTypes(),
  ]);

  const favProducts = products.filter((p) =>
    favourites.some((f) => f.item_type === "product" && f.item_id === p.id),
  );
  const favExtras = extras.filter((e) =>
    favourites.some((f) => f.item_type === "extra_service" && f.item_id === e.id),
  );
  const favConsultations = consultations.filter((c) =>
    favourites.some((f) => f.item_type === "consultation_type" && f.item_id === c.id),
  );
  const archivedCount =
    favourites.length - favProducts.length - favExtras.length - favConsultations.length;

  const empty =
    favProducts.length + favExtras.length + favConsultations.length === 0;

  return (
    <div className="grid gap-5">
      <h1 className="heading-rule font-display text-2xl text-ink">My Favourites</h1>

      {empty ? (
        <EmptyState
          title="Nothing saved yet"
          message="Tap the heart on products, extra services or consultations to keep them here."
          action={<ButtonLink href="/app/products">Browse products</ButtonLink>}
        />
      ) : (
        <>
          {favProducts.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold text-ink-soft">Products</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {favProducts.map((p) => (
                  <Card key={p.id} className="relative p-3">
                    <div className="absolute right-2 top-2 z-10">
                      <FavouriteButton itemType="product" itemId={p.id} isFavourite />
                    </div>
                    <Link href={`/app/products/${p.slug}`}>
                      <ArtBlock seed={p.slug} className="h-20" />
                      <p className="mt-2 text-sm font-semibold">{p.name}</p>
                      <p className="text-sm font-bold text-brand-700">
                        {formatNaira(p.price_kobo)}
                      </p>
                    </Link>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {favExtras.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold text-ink-soft">Extra services</h2>
              {favExtras.map((e) => (
                <Card key={e.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-sm text-ink-soft">
                      {formatNaira(e.price_kobo)} — add it during booking
                    </p>
                  </div>
                  <FavouriteButton itemType="extra_service" itemId={e.id} isFavourite />
                </Card>
              ))}
            </section>
          )}
          {favConsultations.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold text-ink-soft">Consultations</h2>
              {favConsultations.map((c) => (
                <Card key={c.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-sm text-ink-soft">{formatNaira(c.price_kobo)}</p>
                  </div>
                  <FavouriteButton itemType="consultation_type" itemId={c.id} isFavourite />
                </Card>
              ))}
            </section>
          )}
        </>
      )}

      {archivedCount > 0 && (
        <Badge tone="gray">
          {archivedCount} saved item{archivedCount > 1 ? "s are" : " is"} no longer available.
        </Badge>
      )}
    </div>
  );
}
