import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import { getConsultationTypes } from "@/server/catalogue";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatDuration, formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Expert Consultations" };
export const dynamic = "force-dynamic";

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const session = await requireCustomer();
  const supabase = await createClient();
  const [types, { data: bookings }, { data: activeSub }] = await Promise.all([
    getConsultationTypes(),
    supabase
      .from("consultation_bookings")
      .select("*, consultation_type:consultation_types(name)")
      .eq("customer_id", session.customerProfile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("id")
      .eq("customer_id", session.customerProfile.id)
      .in("status", ["active", "expiring_soon", "renewal_due"])
      .limit(1),
  ]);
  const isSubscriber = (activeSub?.length ?? 0) > 0;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Expert Consultations</h1>
        <p className="mt-2 text-sm text-ink-soft">
          One-on-one professional guidance. Expert Consultations are charged
          separately from your membership.
        </p>
      </div>

      {submitted && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold">Consultation request submitted ✓</p>
          <p className="mt-1 text-sm text-ink-soft">
            Where payment applies, your session stays pending until payment —
            online payment opens in the payments phase. The salon will reach
            out to confirm.
          </p>
        </Card>
      )}

      {(bookings ?? []).length > 0 && (
        <Card>
          <p className="font-semibold">Your consultation requests</p>
          <ul className="mt-2 grid gap-2 text-sm">
            {(bookings ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                <span>
                  <span className="font-medium">
                    {(b.consultation_type as { name: string }).name}
                  </span>
                  <span className="block text-ink-soft">{formatDateTime(b.requested_at)}</span>
                </span>
                <Badge tone={b.status === "pending_payment" ? "amber" : b.status === "confirmed" ? "green" : "gray"}>
                  {b.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3">
        {types.map((t) => {
          const price = Math.max(
            0,
            t.price_kobo - (isSubscriber ? t.subscriber_discount_kobo : 0),
          );
          const blocked = t.subscriber_only && !isSubscriber;
          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{t.name}</p>
                <Badge tone="gold">
                  {t.location_type === "virtual" ? "Virtual" : "Salon"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{t.short_description}</p>
              <p className="mt-2 text-sm">
                <span className="font-bold text-brand-700">{formatNaira(price)}</span>
                {isSubscriber && t.subscriber_discount_kobo > 0 && (
                  <span className="ml-1 text-emerald-700">member price</span>
                )}
                <span className="text-ink-soft"> · {formatDuration(t.duration_minutes)}</span>
              </p>
              {blocked ? (
                <p className="mt-2 text-sm text-amber-700">Available to active members only.</p>
              ) : (
                <div className="mt-3">
                  <ButtonLink href={`/app/consultations/${t.slug}/book`} variant="outline">
                    Book this consultation
                  </ButtonLink>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
