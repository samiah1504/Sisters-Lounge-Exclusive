import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import {
  getPlanBySlug,
  getPlanServices,
  getPublicSalons,
} from "@/server/catalogue";
import { getSession } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/format";
import { ButtonLink, Card } from "@/components/ui";
import { JoinCheckout } from "@/components/join-checkout";

export const metadata: Metadata = { title: "Become a Member" };
export const dynamic = "force-dynamic";

/**
 * Membership checkout (payments spec §3, §4, §10): the member sees exactly
 * what they are subscribing to — plan, visits, included treatments, price and
 * the recurring commitment — before authorizing payment.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [plan, session, salons] = await Promise.all([
    getPlanBySlug(slug),
    getSession(),
    getPublicSalons(),
  ]);
  if (!plan || plan.status !== "active" || !plan.is_public) notFound();

  const services = await getPlanServices(plan.id);
  const included = services.filter((s) =>
    ["included", "optional"].includes(s.relation));
  const openSalons = salons.filter((s) => s.status === "open");

  let alreadyActive = false;
  if (session?.customerProfile) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("customer_id", session.customerProfile.id)
      .is("child_id", null)
      .in("status", ["active", "expiring_soon", "renewal_due"])
      .limit(1);
    alreadyActive = Boolean(data && data.length > 0);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">
        Become a Member
      </p>
      <h1 className="mt-1 font-display text-3xl text-ink">{plan.name}</h1>

      <Card className="mt-5">
        <p className="font-display text-3xl font-bold text-brand-900">
          {formatNaira(plan.monthly_price_kobo)}
          <span className="font-sans text-base font-normal text-ink-soft"> /month</span>
        </p>
        <p className="mt-1 font-semibold text-gold-600">
          {plan.visits_included} Salon Visit{plan.visits_included > 1 ? "s" : ""} / Cycle
        </p>
        {included.length > 0 && (
          <>
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-ink-soft">
              Every visit includes
            </p>
            <ul className="mt-2 grid gap-1.5">
              {included.map((row) => (
                <li key={row.service.id} className="flex items-center gap-2 text-[15px]">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  {row.service.name}
                </li>
              ))}
            </ul>
          </>
        )}
        {plan.short_description && (
          <p className="mt-3 text-sm text-ink-soft">{plan.short_description}</p>
        )}
      </Card>

      <div className="mt-6">
        {session && session.profile.role !== "customer" ? (
          <Card>
            <p className="text-sm text-ink">
              You are signed in with a staff account — memberships are for
              member accounts.
            </p>
          </Card>
        ) : alreadyActive ? (
          <Card>
            <p className="text-sm text-ink">
              You already have an active membership.
            </p>
            <div className="mt-3">
              <ButtonLink href="/app/subscription">Manage my membership</ButtonLink>
            </div>
          </Card>
        ) : (
          <JoinCheckout
            planSlug={plan.slug}
            salons={openSalons.map((s) => ({ id: s.id, name: s.name, city: s.city }))}
            signedIn={Boolean(session)}
            memberName={session?.profile.full_name || session?.profile.email || undefined}
          />
        )}
      </div>
    </div>
  );
}
