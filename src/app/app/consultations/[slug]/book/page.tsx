import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { getConsultationTypes } from "@/server/catalogue";
import { getChildren, getSchedulingInfo } from "@/server/customer";
import { formatDuration, formatNaira } from "@/lib/format";
import { Card } from "@/components/ui";
import { ConsultationBookingForm } from "@/components/consultation-booking-form";

export const metadata: Metadata = { title: "Book Consultation" };
export const dynamic = "force-dynamic";

export default async function BookConsultationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireCustomer();
  const [types, childrenList, scheduling] = await Promise.all([
    getConsultationTypes(),
    getChildren(session.customerProfile.id),
    getSchedulingInfo(),
  ]);
  const type = types.find((t) => t.slug === slug);
  if (!type) notFound();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">{type.name}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {type.full_description || type.short_description}
        </p>
      </div>
      <Card className="bg-brand-50">
        <p className="text-sm">
          <span className="font-bold text-brand-700">{formatNaira(type.price_kobo)}</span>
          <span className="text-ink-soft">
            {" "}· {formatDuration(type.duration_minutes)} · charged separately from
            subscriptions. No payment is taken now — bookings stay pending until
            the payments phase.
          </span>
        </p>
      </Card>
      <ConsultationBookingForm
        consultationTypeId={type.id}
        childOptions={childrenList
          .filter((c) => c.is_active)
          .map((c) => ({ id: c.id, name: c.full_name }))}
        minNoticeHours={scheduling?.minNoticeHours ?? 12}
        maxAdvanceDays={scheduling?.maxAdvanceDays ?? 45}
      />
    </div>
  );
}
