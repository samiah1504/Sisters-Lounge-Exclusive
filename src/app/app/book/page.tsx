import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getChildren,
  getExtraServicesWithEligibility,
  getRecommendationRules,
  getSchedulingInfo,
  getSubscriptionOverviews,
} from "@/server/customer";
import { getPublicCategories, getServices } from "@/server/catalogue";
import { profileCompletion } from "@/lib/booking-rules";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { BookingWizard } from "@/components/booking/booking-wizard";

export const metadata: Metadata = { title: "Reserve a Visit" };
export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string }>;
}) {
  const { subscription: preselect } = await searchParams;
  const session = await requireCustomer();

  const completion = profileCompletion({
    full_name: session.profile.full_name,
    phone: session.profile.phone,
    whatsapp_number: session.customerProfile.whatsapp_number,
  });

  if (!completion.complete) {
    return (
      <div className="grid gap-5">
        <h1 className="heading-rule font-display text-2xl text-ink">Reserve a Visit</h1>
        <Card className="border-gold-300 bg-gold-100/50">
          <p className="font-semibold">Complete your profile first</p>
          <p className="mt-1 text-sm text-ink-soft">
            Before reserving we need: {completion.missing.join(", ")}.
          </p>
          <div className="mt-3">
            <ButtonLink href="/app/profile" variant="gold">Complete profile</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const [overviews, childrenList, services, extras, rules, scheduling, categories] =
    await Promise.all([
      getSubscriptionOverviews(session.customerProfile.id),
      getChildren(session.customerProfile.id),
      getServices(),
      getExtraServicesWithEligibility(),
      getRecommendationRules(),
      getSchedulingInfo(),
      getPublicCategories(),
    ]);

  const bookable = overviews.filter(
    (o) =>
      ["active", "expiring_soon", "renewal_due"].includes(o.subscription.status) &&
      o.cycle?.status === "active",
  );

  if (bookable.length === 0 || !scheduling) {
    return (
      <div className="grid gap-5">
        <h1 className="heading-rule font-display text-2xl text-ink">Reserve a Visit</h1>
        <EmptyState
          title="No active membership"
          message="Reserving uses your membership visits. Choose a membership and complete payment to start reserving — the salon team can also activate memberships with you."
          action={<ButtonLink href="/plans">Browse memberships</ButtonLink>}
        />
      </div>
    );
  }

  // Plan-service relations for the bookable plans.
  const supabase = await createClient();
  const { data: planServices } = await supabase
    .from("subscription_plan_services")
    .select("*")
    .in("plan_id", bookable.map((o) => o.plan.id));

  return (
    <div className="grid gap-5">
      <h1 className="heading-rule font-display text-2xl text-ink">Reserve a Visit</h1>
      <BookingWizard
        subscriptions={bookable.map((o) => ({
          id: o.subscription.id,
          planId: o.plan.id,
          planName: o.plan.name,
          categoryId: o.plan.category_id,
          categoryName:
            categories.find((c) => c.id === o.plan.category_id)?.name ?? "",
          childId: o.child?.id ?? null,
          childName: o.child?.full_name ?? null,
          intervalDays: o.plan.min_visit_interval_days,
          availableDays: o.plan.available_days,
          remaining: o.summary.remaining,
          cycleEndsOn: o.cycle!.ends_on,
          liveVisitDates: o.liveVisitDates,
        }))}
        childrenList={childrenList
          .filter((c) => c.is_active)
          .map((c) => ({ id: c.id, name: c.full_name }))}
        services={services}
        planServices={planServices ?? []}
        extras={extras}
        rules={rules}
        scheduling={{
          minNoticeHours: scheduling.minNoticeHours,
          maxAdvanceDays: scheduling.maxAdvanceDays,
        }}
        salons={scheduling.salons}
        salonHours={scheduling.salonHours}
        homeSalonId={bookable[0].subscription.home_salon_id ?? null}
        preselectSubscription={preselect ?? null}
      />
    </div>
  );
}
