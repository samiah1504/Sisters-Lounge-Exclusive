import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import {
  getPendingSelection,
  getSubscriptionOverviews,
} from "@/server/customer";
import { formatDate, formatNaira } from "@/lib/format";
import {
  ButtonLink,
  Card,
  EmptyState,
  Meter,
  SubscriptionStatusBadge,
} from "@/components/ui";
import {
  CancelSelectionButton,
  RenewalOptOutToggle,
} from "@/components/subscription-controls";

export const metadata: Metadata = { title: "My Membership" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const { selected } = await searchParams;
  const session = await requireCustomer();
  const [overviews, pendingSelection] = await Promise.all([
    getSubscriptionOverviews(session.customerProfile.id),
    getPendingSelection(session.customerProfile.id),
  ]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">My Membership</h1>
      </div>

      {selected && pendingSelection && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold">Membership selection saved ✓</p>
          <p className="mt-1 text-sm text-ink-soft">
            Your {pendingSelection.plan.name} selection is stored on your
            account. Payment activation will be handled in the payments phase —
            nothing has been charged.
          </p>
        </Card>
      )}

      {pendingSelection && (
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Pending membership selection
              </p>
              <p className="font-display text-xl text-brand-900">
                {pendingSelection.plan.name}
              </p>
              <p className="text-sm text-ink-soft">
                {formatNaira(pendingSelection.plan.monthly_price_kobo)}/month ·
                awaiting payment activation
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/plans" variant="outline">Change membership</ButtonLink>
            <CancelSelectionButton selectionId={pendingSelection.id} />
          </div>
        </Card>
      )}

      {overviews.length === 0 && !pendingSelection && (
        <EmptyState
          title="No membership yet"
          message="Choose a membership to start reserving consistent salon visits."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      )}

      {overviews.map((o) => (
        <Card key={o.subscription.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                {o.child ? `${o.child.full_name}'s membership` : "Your membership"}
              </p>
              <p className="font-display text-xl text-brand-900">{o.plan.name}</p>
              <p className="text-sm text-ink-soft">
                {formatNaira(o.plan.monthly_price_kobo)}/month
              </p>
            </div>
            <SubscriptionStatusBadge status={o.subscription.status} />
          </div>

          {o.cycle && (
            <div className="mt-3 rounded-xl bg-brand-50 p-3.5">
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Cycle {o.cycle.cycle_number}</span>
                <span className="font-semibold">
                  {formatDate(o.cycle.starts_on)} → {formatDate(o.cycle.ends_on)}
                </span>
              </div>
              <div className="mt-2">
                <Meter value={o.summary.used + o.summary.reserved} max={o.summary.included} />
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                {o.summary.remaining} remaining · {o.summary.reserved} reserved ·{" "}
                {o.summary.used} used of {o.summary.included}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Unused visits expire on {formatDate(o.cycle.ends_on)} and cannot
                be carried forward.
              </p>
            </div>
          )}

          {["active", "expiring_soon", "renewal_due"].includes(o.subscription.status) && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={`/app/book?subscription=${o.subscription.id}`}>
                  Reserve a visit
                </ButtonLink>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <RenewalOptOutToggle
                  subscriptionId={o.subscription.id}
                  optedOut={o.subscription.opt_out_next_renewal}
                />
                <p className="mt-2 text-xs text-ink-soft">
                  An already-paid cycle cannot be cancelled or paused. Opting
                  out simply means you won&apos;t be renewed when this cycle ends.
                  Membership changes take effect from your next cycle.
                </p>
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
