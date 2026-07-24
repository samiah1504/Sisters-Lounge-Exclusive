import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { setConsultationBookingStatus } from "@/server/actions/admin";
import { formatDateTime, formatNaira } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Consultations" };
export const dynamic = "force-dynamic";

const TONES = {
  pending_payment: "amber", pending_confirmation: "amber",
  confirmed: "green", completed: "green", cancelled: "gray", expired: "gray",
} as const;

export default async function AdminConsultationsPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const [{ data: bookingsData }, { data: types }] = await Promise.all([
    supabase
      .from("consultation_bookings")
      .select(
        "*, consultation_type:consultation_types(name), child:children(full_name), " +
          "customer:customer_profiles(id, profile:profiles(full_name, phone))",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("consultation_types").select("*").order("display_order"),
  ]);
  const bookings = (bookingsData ?? []) as Row[];

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Consultations</h1>

      <section className="grid gap-2.5">
        <h2 className="font-semibold text-ink-soft">Booking requests</h2>
        {bookings.length === 0 ? (
          <EmptyState title="No requests yet" message="Consultation requests appear here." />
        ) : (
          bookings.map((b) => {
            const cust = b.customer as unknown as { id: string; profile: { full_name: string; phone: string | null } };
            return (
              <Card key={b.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {(b.consultation_type as { name: string })?.name}
                      <span className="ml-2 text-sm font-normal text-ink-soft">
                        {cust?.profile?.full_name}
                        {b.child && ` → ${(b.child as { full_name: string }).full_name}`}
                      </span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      Requested {formatDateTime(b.requested_at)} · {formatNaira(b.price_kobo)}
                      {b.status === "pending_payment" && " (pending value — no payment taken)"}
                    </p>
                    {b.concerns && (
                      <p className="mt-1 rounded-xl bg-brand-50 px-3 py-1.5 text-sm">“{b.concerns}”</p>
                    )}
                  </div>
                  <Badge tone={TONES[b.status as keyof typeof TONES] ?? "gray"}>
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                {!["completed", "cancelled", "expired"].includes(b.status) && (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {b.status !== "confirmed" && (
                      <form action={setConsultationBookingStatus.bind(null, b.id, "confirmed")}>
                        <button className="font-semibold text-emerald-700 hover:underline">Confirm</button>
                      </form>
                    )}
                    {b.status === "confirmed" && (
                      <form action={setConsultationBookingStatus.bind(null, b.id, "completed")}>
                        <button className="font-semibold text-emerald-700 hover:underline">Mark completed</button>
                      </form>
                    )}
                    <form action={setConsultationBookingStatus.bind(null, b.id, "cancelled")}>
                      <button className="font-semibold text-red-700 hover:underline">Cancel</button>
                    </form>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </section>

      <section className="grid gap-2.5">
        <h2 className="font-semibold text-ink-soft">Consultation types</h2>
        {(types ?? []).map((t) => (
          <Card key={t.id} className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-ink-soft">
                {formatNaira(t.price_kobo)} · {t.duration_minutes} min · {t.location_type}
                {t.subscriber_discount_kobo > 0 &&
                  ` · subscriber discount ${formatNaira(t.subscriber_discount_kobo)}`}
              </p>
            </div>
            <Badge tone={t.is_active ? "green" : "gray"}>{t.is_active ? "Active" : "Hidden"}</Badge>
          </Card>
        ))}
        <p className="text-xs text-ink-soft">
          Consultation types are seeded; full type editing joins the payments
          phase alongside questionnaires and photo uploads.
        </p>
      </section>
    </div>
  );
}
