import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/server/auth";
import { getAppointments } from "@/server/customer";
import { formatDateTime, formatNaira } from "@/lib/format";
import {
  AppointmentStatusBadge,
  ButtonLink,
  Card,
  EmptyState,
} from "@/components/ui";

export const metadata: Metadata = { title: "My Visits" };
export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const session = await requireCustomer();
  const appointments = await getAppointments(session.customerProfile.id);
  const now = new Date();
  const upcoming = appointments
    .filter((a) => new Date(a.starts_at) >= now &&
      !["completed", "missed", "cancelled_salon", "cancelled_admin", "expired", "no_longer_eligible"].includes(a.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = appointments.filter((a) => !upcoming.includes(a));

  const Item = ({ a }: { a: (typeof appointments)[number] }) => (
    <Link href={`/app/appointments/${a.id}`}>
      <Card className="hover:border-brand-400">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{a.service.name}</p>
            <p className="text-sm text-ink-soft">
              {formatDateTime(a.starts_at)}
              {a.child ? ` · for ${a.child.full_name}` : ""}
              {a.salon ? ` · ${a.salon.name}` : ""}
            </p>
            {a.extras.length > 0 && (
              <p className="mt-0.5 text-sm text-brand-700">
                +{a.extras.length} add-on{a.extras.length > 1 ? "s" : ""} ·{" "}
                {formatNaira(a.addon_total_kobo)}
              </p>
            )}
          </div>
          <AppointmentStatusBadge status={a.status} />
        </div>
      </Card>
    </Link>
  );

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between">
        <h1 className="heading-rule font-display text-2xl text-ink">My Visits</h1>
        <ButtonLink href="/app/book">Book</ButtonLink>
      </div>

      <section className="grid gap-3">
        <h2 className="font-semibold text-ink-soft">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing booked yet"
            message="Book your next visit to keep your routine consistent."
            action={<ButtonLink href="/app/book">Reserve a visit</ButtonLink>}
          />
        ) : (
          upcoming.map((a) => <Item key={a.id} a={a} />)
        )}
      </section>

      {past.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-semibold text-ink-soft">Past</h2>
          {past.slice(0, 10).map((a) => <Item key={a.id} a={a} />)}
        </section>
      )}
    </div>
  );
}
