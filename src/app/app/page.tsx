import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/server/auth";
import {
  getAppointments,
  getChildren,
  getPendingSelection,
  getRetentionPrompts,
  getSubscriptionOverviews,
} from "@/server/customer";
import { profileCompletion } from "@/lib/booking-rules";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import {
  AppointmentStatusBadge,
  Badge,
  ButtonLink,
  Card,
  Meter,
  SubscriptionStatusBadge,
} from "@/components/ui";
import { PromptCard } from "@/components/prompt-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireCustomer();
  const customerId = session.customerProfile.id;
  const supabase = await createClient();
  const [overviews, childrenList, appointments, prompts, pendingSelection, { data: convs }] =
    await Promise.all([
      getSubscriptionOverviews(customerId),
      getChildren(customerId),
      getAppointments(customerId),
      getRetentionPrompts(customerId),
      getPendingSelection(customerId),
      supabase
        .from("support_conversations")
        .select("last_staff_message_at, customer_last_read_at")
        .eq("customer_id", customerId),
    ]);
  const unreadSupport = (convs ?? []).filter(
    (c) =>
      c.last_staff_message_at &&
      (!c.customer_last_read_at || c.last_staff_message_at > c.customer_last_read_at),
  ).length;

  const completion = profileCompletion({
    full_name: session.profile.full_name,
    phone: session.profile.phone,
    whatsapp_number: session.customerProfile.whatsapp_number,
  });

  const activeOverviews = overviews.filter((o) =>
    ["active", "expiring_soon", "renewal_due"].includes(o.subscription.status),
  );
  const upcoming = appointments
    .filter(
      (a) =>
        new Date(a.starts_at) > new Date() &&
        ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"].includes(a.status),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const nextAppointment = upcoming[0] ?? null;
  const addonPaymentPending = appointments.some((a) => a.status === "pending_addon_payment");
  const firstName = session.profile.full_name.split(" ")[0] || "there";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl text-brand-900">
          Assalamu alaikum, {firstName}
        </h1>
        <p className="text-sm text-ink-soft">
          Here&apos;s where your hair care stands today.
        </p>
      </div>

      {/* profile completion */}
      {!completion.complete && (
        <Card className="border-gold-300 bg-gold-100/50">
          <p className="font-semibold text-ink">Complete your profile to book visits</p>
          <p className="mt-1 text-sm text-ink-soft">
            Missing: {completion.missing.join(", ")}.
          </p>
          <div className="mt-3">
            <ButtonLink href="/app/profile" variant="gold">Complete profile</ButtonLink>
          </div>
        </Card>
      )}

      {/* retention prompts */}
      {prompts.slice(0, 3).map((p) => (
        <PromptCard key={p.id} prompt={p} />
      ))}

      {/* add-on payment pending */}
      {addonPaymentPending && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-semibold">Add-on payment pending</p>
          <p className="mt-1 text-sm text-ink-soft">
            An appointment includes add-ons that need payment before
            confirmation. Online payment opens in the payments phase — the
            salon will confirm your booking in the meantime.
          </p>
        </Card>
      )}

      {/* subscriptions */}
      {activeOverviews.length === 0 ? (
        <Card>
          <p className="font-display text-lg text-brand-900">No active plan yet</p>
          {pendingSelection ? (
            <>
              <p className="mt-1 text-sm text-ink-soft">
                Your <strong>{pendingSelection.plan.name}</strong> selection is
                saved and awaiting payment activation (arriving in the payments
                phase).
              </p>
              <div className="mt-3 flex gap-2">
                <ButtonLink href="/app/subscription" variant="outline">View selection</ButtonLink>
                <ButtonLink href="/plans" variant="ghost">Change plan</ButtonLink>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-soft">
                Choose a monthly plan to start booking consistent salon visits.
              </p>
              <div className="mt-3">
                <ButtonLink href="/plans">View Plans</ButtonLink>
              </div>
            </>
          )}
        </Card>
      ) : (
        activeOverviews.map((o) => (
          <Card key={o.subscription.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                  {o.child ? `${o.child.full_name}'s plan` : "Your plan"}
                </p>
                <p className="font-display text-xl text-brand-900">{o.plan.name}</p>
              </div>
              <SubscriptionStatusBadge status={o.subscription.status} />
            </div>
            {o.cycle && (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-brand-50 px-2 py-2.5">
                    <p className="font-display text-xl font-bold text-brand-900">
                      {o.summary.remaining}
                    </p>
                    <p className="text-[11px] font-semibold text-ink-soft">Remaining</p>
                  </div>
                  <div className="rounded-xl bg-brand-50 px-2 py-2.5">
                    <p className="font-display text-xl font-bold text-brand-900">
                      {o.summary.reserved}
                    </p>
                    <p className="text-[11px] font-semibold text-ink-soft">Reserved</p>
                  </div>
                  <div className="rounded-xl bg-brand-50 px-2 py-2.5">
                    <p className="font-display text-xl font-bold text-brand-900">
                      {o.summary.used}
                    </p>
                    <p className="text-[11px] font-semibold text-ink-soft">Used</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Meter
                    value={o.summary.used + o.summary.reserved}
                    max={o.summary.included}
                  />
                  <p className="mt-1.5 text-xs text-ink-soft">
                    {o.summary.included} visit{o.summary.included !== 1 ? "s" : ""} this
                    cycle · started {formatDate(o.cycle.starts_on)} · expires{" "}
                    {formatDate(o.cycle.ends_on)} — unused visits do not roll over
                  </p>
                </div>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink
                href={`/app/book?subscription=${o.subscription.id}`}
                className="flex-1 sm:flex-none"
              >
                Book Appointment
              </ButtonLink>
              <ButtonLink href="/app/subscription" variant="outline">
                Manage
              </ButtonLink>
            </div>
          </Card>
        ))
      )}

      {/* next appointment */}
      {nextAppointment && (
        <Card>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
              Next appointment
            </p>
            <AppointmentStatusBadge status={nextAppointment.status} />
          </div>
          <p className="mt-1 font-display text-lg text-brand-900">
            {formatDateTime(nextAppointment.starts_at)}
          </p>
          <p className="text-sm text-ink-soft">
            {nextAppointment.service.name}
            {nextAppointment.child ? ` · for ${nextAppointment.child.full_name}` : ""}
            {nextAppointment.extras.length > 0 &&
              ` · +${nextAppointment.extras.length} add-on${nextAppointment.extras.length > 1 ? "s" : ""}`}
          </p>
          {nextAppointment.addon_total_kobo > 0 && (
            <p className="mt-1 text-sm font-semibold text-brand-700">
              Add-ons due at salon: {formatNaira(nextAppointment.addon_total_kobo)}
            </p>
          )}
          <div className="mt-3">
            <ButtonLink
              href={`/app/appointments/${nextAppointment.id}`}
              variant="outline"
            >
              View details
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* children summary */}
      <Card>
        <div className="flex items-center justify-between">
          <p className="font-display text-lg text-brand-900">Your children</p>
          <ButtonLink href="/app/children/new" variant="outline">Add Child</ButtonLink>
        </div>
        {childrenList.filter((c) => c.is_active).length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Add your children to manage their plans and book their visits from
            this account.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {childrenList
              .filter((c) => c.is_active)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/children/${c.id}`}
                    className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-brand-400"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                      {c.full_name[0]}
                    </span>
                    <span className="font-medium">{c.full_name}</span>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* chat with the salon */}
      <Link href="/app/support">
        <Card className="border-brand-200 bg-brand-50/60 hover:border-brand-400">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-brand-900">Chat with Your Salon Manager</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Questions, complaints or special requests — message us any time.
              </p>
            </div>
            {unreadSupport > 0 ? (
              <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-brand-600 px-2 text-sm font-bold text-white">
                {unreadSupport}
              </span>
            ) : (
              <span className="shrink-0 text-brand-600">→</span>
            )}
          </div>
        </Card>
      </Link>

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <ButtonLink href="/plans" variant="outline">View Plans</ButtonLink>
        <ButtonLink href="/app/consultations" variant="outline">Book Consultation</ButtonLink>
        <ButtonLink href="/app/products" variant="outline">Browse Products</ButtonLink>
        <ButtonLink href="/app/favourites" variant="outline">My Favourites</ButtonLink>
      </div>

      {/* product recommendations placeholder */}
      <Card className="border-dashed">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Recommended for you</p>
          <Badge tone="gray">Coming with your visit history</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          After your visits, products your stylist recommends will appear here.
        </p>
      </Card>
    </div>
  );
}
