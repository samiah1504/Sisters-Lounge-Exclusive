import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/format";
import { ButtonLink, Card } from "@/components/ui";
import { ResumeCheckoutButton } from "@/components/resume-checkout";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Complete Your Membership" };
export const dynamic = "force-dynamic";

/**
 * Landing for accounts that exist but never completed a membership purchase
 * (payments spec §6 amendment, owner decision 8): resume the pending
 * checkout, or choose a membership if none is pending. No member benefits
 * are reachable from here.
 */
export default async function ResumeMembershipPage() {
  const session = await getSession();
  if (!session) redirect("/plans");
  if (session.profile.role !== "customer") {
    redirect(session.profile.role === "admin" ? "/admin" : "/staff");
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", session.customerProfile!.id);
  if (count) redirect("/app");

  const { data } = await supabase
    .from("pending_plan_selections")
    .select(
      "id, status, child_id, home_salon_id, " +
        "plan:subscription_plans(name, slug, monthly_price_kobo, visits_included), " +
        "salon:salons(name)",
    )
    .eq("status", "pending_payment")
    .is("child_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const selection = (data?.[0] ?? null) as Row | null;
  const plan = (selection?.plan ?? null) as Row | null;
  const salon = (selection?.salon ?? null) as Row | null;

  const firstName = session.profile.full_name.split(" ")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">
        Almost there, {firstName}
      </p>
      <h1 className="mt-1 font-display text-3xl text-ink">Complete Your Membership</h1>
      <p className="mt-2 max-w-lg text-ink-soft">
        Your account is ready — your membership activates the moment your
        first payment is confirmed.
      </p>

      {plan ? (
        <>
          <Card className="mt-6">
            <h2 className="font-display text-xl text-brand-700">{plan.name}</h2>
            <p className="mt-2 font-display text-2xl font-bold text-brand-900">
              {formatNaira(plan.monthly_price_kobo)}
              <span className="font-sans text-sm font-normal text-ink-soft"> /month</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-gold-600">
              {plan.visits_included} Salon Visit{plan.visits_included > 1 ? "s" : ""} / Cycle
            </p>
            {salon && (
              <p className="mt-1 text-sm text-ink-soft">Home salon: {salon.name}</p>
            )}
            <p className="mt-3 text-sm text-ink-soft">
              Renews automatically each billing cycle until you cancel it.
            </p>
          </Card>
          <div className="mt-5 grid gap-3">
            <ResumeCheckoutButton />
            <ButtonLink href="/plans" variant="ghost">
              Choose a different membership
            </ButtonLink>
          </div>
        </>
      ) : (
        <div className="mt-6 grid gap-3">
          <Card>
            <p className="text-sm text-ink">
              You have not chosen a membership yet — pick the plan that fits
              your routine and you will be reserving visits in minutes.
            </p>
          </Card>
          <ButtonLink href="/plans">Choose Your Membership</ButtonLink>
        </div>
      )}
    </div>
  );
}
