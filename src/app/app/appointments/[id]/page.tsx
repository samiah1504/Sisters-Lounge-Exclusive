import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { getAppointment, getSchedulingInfo } from "@/server/customer";
import { canReschedule } from "@/lib/booking-rules";
import { formatDateTime, formatDuration, formatNaira } from "@/lib/format";
import {
  AppointmentStatusBadge,
  ButtonLink,
  Card,
} from "@/components/ui";

export const metadata: Metadata = { title: "Appointment" };
export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ booked?: string; rescheduled?: string }>;
}) {
  const { id } = await params;
  const { booked, rescheduled } = await searchParams;
  const session = await requireCustomer();
  const [appt, scheduling] = await Promise.all([
    getAppointment(session.customerProfile.id, id),
    getSchedulingInfo(),
  ]);
  if (!appt) notFound();

  const reschedulable = canReschedule(
    appt.status,
    appt.starts_at,
    scheduling?.rescheduleDeadlineHours ?? 24,
  );

  return (
    <div className="grid gap-4">
      {booked && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold">Booking confirmed ✓</p>
          <p className="mt-1 text-sm text-ink-soft">
            One subscription visit has been reserved. It is only used once your
            appointment is completed.
            {appt.status === "pending_addon_payment" &&
              " Your add-ons need payment before final confirmation — online payment opens in the payments phase."}
          </p>
        </Card>
      )}
      {rescheduled && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold">Appointment rescheduled ✓</p>
          <p className="mt-1 text-sm text-ink-soft">
            Your visit reservation moved with the new time.
          </p>
        </Card>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{appt.service.name}</h1>
          <p className="text-sm text-ink-soft">
            {formatDateTime(appt.starts_at)}
            {appt.child ? ` · for ${appt.child.full_name}` : ""}
          </p>
        </div>
        <AppointmentStatusBadge status={appt.status} />
      </div>

      <Card>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Salon</dt>
            <dd className="text-right font-semibold">
              {appt.salon ? `${appt.salon.name}, ${appt.salon.city}` : "Sisters Lounge Salon"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Duration</dt>
            <dd className="font-semibold">{formatDuration(appt.duration_minutes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Stylist</dt>
            <dd className="font-semibold">
              {appt.stylist_profile_id
                ? "Assigned — see you there!"
                : "Assigned by the salon before your visit"}
            </dd>
          </div>
          <div className="my-1 border-t border-line" />
          <div className="flex justify-between">
            <dt>Subscription visit — {appt.service.name}</dt>
            <dd className="font-bold text-emerald-700">Included</dd>
          </div>
          {appt.extras.map((e, i) => (
            <div key={i} className="flex justify-between">
              <dt>{e.extra_service.name}</dt>
              <dd className="font-semibold">{formatNaira(e.price_kobo)}</dd>
            </div>
          ))}
          {appt.extras.length > 0 && (
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="font-semibold">Total extra services</dt>
              <dd className="font-bold text-brand-700">
                {formatNaira(appt.addon_total_kobo)}
              </dd>
            </div>
          )}
          {appt.status === "pending_addon_payment" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              Add-on payment pending — required before the salon confirms this
              booking. Online payment arrives in the payments phase.
            </p>
          )}
        </dl>
      </Card>

      {appt.customer_notes && (
        <Card>
          <p className="text-sm font-semibold text-ink-soft">Your notes</p>
          <p className="mt-1 text-sm">{appt.customer_notes}</p>
        </Card>
      )}

      {appt.status === "missed" && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-semibold">This appointment was missed</p>
          <p className="mt-1 text-sm text-ink-soft">
            Your visit was not used — it returned to your balance while your
            cycle is active. Choose another date that works for you.
          </p>
          <div className="mt-3">
            <ButtonLink href="/app/book">Rebook a visit</ButtonLink>
          </div>
        </Card>
      )}

      {appt.status === "completed" && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold">Visit completed ✓</p>
          <p className="mt-1 text-sm text-ink-soft">
            This visit has been used from your subscription. Keep the routine
            going — book your next one.
          </p>
          <div className="mt-3">
            <ButtonLink href="/app/book" variant="outline">Book next visit</ButtonLink>
          </div>
        </Card>
      )}

      {reschedulable && (
        <div className="grid gap-2">
          <ButtonLink href={`/app/appointments/${appt.id}/reschedule`} variant="outline">
            Reschedule this appointment
          </ButtonLink>
          <p className="text-center text-xs text-ink-soft">
            Need to cancel instead? Rescheduling keeps your reserved visit —
            contact the salon if you can no longer attend at all.
          </p>
        </div>
      )}
    </div>
  );
}
