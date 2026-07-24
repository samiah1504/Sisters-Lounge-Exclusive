import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import {
  getAppointments,
  getChildren,
  getSubscriptionOverviews,
} from "@/server/customer";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  AppointmentStatusBadge,
  Badge,
  ButtonLink,
  Card,
  Meter,
  SubscriptionStatusBadge,
} from "@/components/ui";
import { ChildArchiveButton } from "@/components/child-archive-button";
import { ChildForm } from "@/components/child-form";

export const metadata: Metadata = { title: "Child Profile" };
export const dynamic = "force-dynamic";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireCustomer();
  const [childrenList, overviews, appointments] = await Promise.all([
    getChildren(session.customerProfile.id),
    getSubscriptionOverviews(session.customerProfile.id),
    getAppointments(session.customerProfile.id),
  ]);
  const child = childrenList.find((c) => c.id === id);
  if (!child) notFound();

  const sub = overviews.find(
    (o) => o.child?.id === child.id &&
      ["active", "expiring_soon", "renewal_due"].includes(o.subscription.status),
  );
  const childAppointments = appointments.filter((a) => a.child_id === child.id);

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-xl font-bold text-white">
          {child.full_name[0]}
        </span>
        <div>
          <h1 className="font-display text-2xl text-ink">{child.full_name}</h1>
          <p className="text-sm text-ink-soft">
            Born {formatDate(child.date_of_birth)}
            {!child.is_active && " · archived"}
          </p>
        </div>
      </div>

      {sub ? (
        <Card>
          <div className="flex items-start justify-between">
            <p className="font-display text-lg text-brand-900">{sub.plan.name} plan</p>
            <SubscriptionStatusBadge status={sub.subscription.status} />
          </div>
          {sub.cycle && (
            <>
              <div className="mt-2">
                <Meter value={sub.summary.used + sub.summary.reserved} max={sub.summary.included} />
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                {sub.summary.remaining} of {sub.summary.included} visits remaining ·
                expires {formatDate(sub.cycle.ends_on)}
              </p>
            </>
          )}
          <div className="mt-3">
            <ButtonLink href={`/app/book?subscription=${sub.subscription.id}`}>
              Book a visit for {child.full_name.split(" ")[0]}
            </ButtonLink>
          </div>
        </Card>
      ) : (
        child.is_active && (
          <Card>
            <p className="text-sm text-ink-soft">
              No active plan for {child.full_name.split(" ")[0]} yet.
            </p>
            <div className="mt-3">
              <ButtonLink href="/plans?category=kids" variant="outline">
                Browse kids&apos; plans
              </ButtonLink>
            </div>
          </Card>
        )
      )}

      {(child.allergies || child.sensitivities || child.hair_scalp_notes) && (
        <Card>
          <p className="font-semibold">Care notes</p>
          <dl className="mt-2 grid gap-2 text-sm">
            {child.allergies && (
              <div><dt className="font-semibold text-red-700">Allergies</dt><dd className="text-ink-soft">{child.allergies}</dd></div>
            )}
            {child.sensitivities && (
              <div><dt className="font-semibold">Sensitivities</dt><dd className="text-ink-soft">{child.sensitivities}</dd></div>
            )}
            {child.hair_scalp_notes && (
              <div><dt className="font-semibold">Hair &amp; scalp</dt><dd className="text-ink-soft">{child.hair_scalp_notes}</dd></div>
            )}
          </dl>
        </Card>
      )}

      {childAppointments.length > 0 && (
        <Card>
          <p className="font-semibold">Visit history</p>
          <ul className="mt-2 grid gap-2">
            {childAppointments.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/app/appointments/${a.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-sm hover:border-brand-400"
                >
                  <span>
                    <span className="font-medium">{a.service.name}</span>
                    <span className="block text-ink-soft">{formatDateTime(a.starts_at)}</span>
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {child.is_active ? (
        <details className="rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">Edit profile</summary>
          <div className="mt-4">
            <ChildForm child={child} />
          </div>
        </details>
      ) : (
        <Badge tone="gray">This profile is archived — history is preserved.</Badge>
      )}

      <ChildArchiveButton childId={child.id} archived={!child.is_active} />
    </div>
  );
}
