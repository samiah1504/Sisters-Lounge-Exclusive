import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { getAppointment, getSchedulingInfo } from "@/server/customer";
import { canReschedule } from "@/lib/booking-rules";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import { RescheduleForm } from "@/components/reschedule-form";

export const metadata: Metadata = { title: "Reschedule" };
export const dynamic = "force-dynamic";

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireCustomer();
  const [appt, scheduling] = await Promise.all([
    getAppointment(session.customerProfile.id, id),
    getSchedulingInfo(),
  ]);
  if (!appt || !scheduling) notFound();
  if (!canReschedule(appt.status, appt.starts_at, scheduling.rescheduleDeadlineHours)) {
    redirect(`/app/appointments/${id}`);
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Reschedule</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Currently: <strong>{formatDateTime(appt.starts_at)}</strong> —{" "}
          {appt.service.name}
        </p>
      </div>
      <Card className="bg-brand-50">
        <p className="text-sm text-ink-soft">
          Your reserved visit moves with the appointment. The new time must be
          within your subscription cycle, at least{" "}
          {scheduling.minNoticeHours} hours from now, and keep the required gap
          between your subscription visits.
        </p>
      </Card>
      <RescheduleForm
        appointmentId={appt.id}
        durationMinutes={appt.duration_minutes}
        salonId={appt.salon_id}
        minNoticeHours={scheduling.minNoticeHours}
        maxAdvanceDays={scheduling.maxAdvanceDays}
      />
    </div>
  );
}
