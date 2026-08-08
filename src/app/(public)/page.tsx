import Link from "next/link";
import {
  getConsultationTypes,
  getPublicExtraServices,
  getPublicPlans,
  getPublicProducts,
  getPublicSalons,
} from "@/server/catalogue";
import { formatNaira } from "@/lib/format";
import { ArtBlock, Badge, ButtonLink, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [plans, extras, consultations, products, salons] = await Promise.all([
    getPublicPlans(),
    getPublicExtraServices(),
    getConsultationTypes(),
    getPublicProducts(),
    getPublicSalons(),
  ]);
  const openSalons = salons.filter((s) => s.status === "open");
  const comingSoon = salons.filter((s) => s.status !== "open");

  return (
    <>
      {/* ------------------------------------------------- welcome (§3.1) */}
      <section className="bg-gradient-to-b from-brand-50 to-cream">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">
              Welcome to Sisters Lounge
            </p>
            <h1 className="font-display text-4xl leading-tight text-brand-900 sm:text-5xl">
              A Subscription-Based Salon for Natural Hair&nbsp;Care
            </h1>
            <p className="mt-4 max-w-xl text-[17px] text-ink-soft">
              Healthy natural hair through consistent professional care. No
              walk-ins, no overcrowding — a calm, exclusive space reserved for
              members.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/plans">Become a Member</ButtonLink>
              <ButtonLink href="/login" variant="outline">Sign In</ButtonLink>
              <ButtonLink href="#explore" variant="ghost">Explore</ButtonLink>
            </div>
            <p className="mt-5 text-sm text-ink-soft">
              One membership, valid at every Sisters Lounge Salon nationwide.
            </p>
          </div>

          <div className="relative grid content-center gap-3 rounded-3xl bg-gradient-to-br from-brand-100/60 to-gold-100/60 p-5">
            <Card className="max-w-xs justify-self-start">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Your membership
              </p>
              <p className="font-bold text-brand-900">Deluxe · 3 visits / month</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
                <div className="h-full w-2/3 rounded-full bg-brand-600" />
              </div>
              <p className="mt-1 text-sm text-ink-soft">2 visits remaining</p>
            </Card>
            <Card className="max-w-xs justify-self-end">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Next reserved visit
              </p>
              <p className="font-bold text-brand-900">Sat · 10:00 AM</p>
              <p className="text-sm text-ink-soft">Sisters Lounge Salon Ilorin</p>
            </Card>
            <Card className="ml-6 max-w-xs justify-self-start">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Added to visit
              </p>
              <p className="font-bold text-brand-900">Henna + Hair trimming</p>
            </Card>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ why members-only */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="explore">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          A Club, Not a Queue
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Members only", "No walk-ins and no overcrowding. Every chair is reserved for a member, so your visit is calm and on time."],
            ["Consistent care", "A set number of visits every month keeps your hair on a routine — the single biggest factor in healthy natural hair."],
            ["Visit any salon", "Your membership works at every Sisters Lounge Salon. Reserve wherever suits you as we open across Nigeria."],
          ].map(([title, body]) => (
            <Card key={title}>
              <h3 className="font-display text-lg text-brand-700">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- plans */}
      <section className="bg-brand-50" id="plans">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
            Choose Your Membership
          </h2>
          <p className="mt-3 max-w-xl text-ink-soft">
            Every membership runs monthly with a set number of salon visits
            included — same price at every salon, nationwide.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.slice(0, 6).map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                {plan.is_featured && (
                  <span className="mb-2 self-start rounded-full bg-gold-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-xl text-brand-700">{plan.name}</h3>
                <p className="mt-1 text-sm text-ink-soft">{plan.short_description}</p>
                <p className="mt-3 font-display text-2xl font-bold text-brand-900">
                  {formatNaira(plan.monthly_price_kobo)}
                  <span className="font-sans text-sm font-normal text-ink-soft">
                    {" "}/month
                  </span>
                </p>
                <p className="mt-1 text-sm font-semibold text-gold-600">
                  {plan.visits_included} salon visit{plan.visits_included > 1 ? "s" : ""} included
                </p>
                <div className="mt-4 pt-2">
                  <ButtonLink href={`/plans/${plan.slug}`} variant="outline" className="w-full">
                    View Membership
                  </ButtonLink>
                </div>
              </Card>
            ))}
          </div>
          {plans.length === 0 && (
            <p className="mt-6 rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
              Membership plans are being prepared — check back shortly.
            </p>
          )}
          <p className="mt-5 text-sm text-ink-soft">
            Visits must be at least seven days apart. Unused visits expire at
            the end of the monthly cycle and cannot be carried forward.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="how-it-works">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Membership in Four Simple Steps
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Become a member", "Choose the membership that matches your routine — for yourself or your children."],
            ["Activate your membership", "Complete payment and your monthly cycle starts right away."],
            ["Reserve your visits", "Reserve ahead at any open Sisters Lounge Salon, including weekends — at least seven days apart."],
            ["Visit and stay consistent", "Track visits used and remaining from your member dashboard, with reminders before each one."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line bg-white p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-display text-lg">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-xl border-l-4 border-gold-600 bg-white px-4 py-3 text-sm">
          <strong>Please note:</strong> unused visits expire at the end of the
          membership cycle and cannot be carried forward.
        </p>
      </section>

      {/* ---------------------------------------------------------- salons */}
      <section className="bg-brand-50" id="salons">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
            Sisters Lounge Salons
          </h2>
          <p className="mt-3 max-w-xl text-ink-soft">
            Company-owned mini studios, opening across Nigeria. Your membership
            is valid at every one of them.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openSalons.map((s) => (
              <Card key={s.slug}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-brand-700">{s.city}</h3>
                  <Badge tone="green">Open</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{s.name}</p>
              </Card>
            ))}
            {comingSoon.map((s) => (
              <Card key={s.slug} className="border-dashed">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-ink-soft">{s.city}</h3>
                  <Badge tone="gold">Coming soon</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  Join the waitlist to be first in.
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-5">
            <ButtonLink href="/salons" variant="outline">
              View All Salons &amp; Waitlists
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- extra services */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="extra-services">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Personalise Every Visit
        </h2>
        <p className="mt-3 max-w-xl text-ink-soft">
          Members can add extra services to any reserved visit. Each add-on
          attracts an additional fee.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2.5">
          {(extras.length > 0
            ? extras.map((e) => e.name)
            : ["Hair dyeing", "Beading", "Manicure", "Pedicure", "Henna", "Hair trimming", "Special styling", "Treatments"]
          ).map((name) => (
            <li
              key={name}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700"
            >
              {name}
            </li>
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------- family profiles */}
      <section className="bg-brand-50">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
              One Account for the Whole Family
            </h2>
            <p className="mt-3 max-w-xl text-ink-soft">
              Parents can create profiles for multiple children, manage each
              child&apos;s membership, reserve visits and view their hair-care
              history — all from one account.
            </p>
            <div className="mt-5">
              <ButtonLink href="/register">Create Your Account</ButtonLink>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              ["A", "Aisha · Kids Membership", "1 of 2 visits used"],
              ["H", "Halima · Kids Membership", "Next visit: Saturday"],
            ].map(([initial, name, sub]) => (
              <Card key={name} className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 font-bold text-white">
                  {initial}
                </span>
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-ink-soft">{sub}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- consultations */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="consultations">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Expert Consultations
        </h2>
        <p className="mt-3 max-w-xl text-ink-soft">
          One-on-one sessions with a Sisters Lounge professional — hair health
          assessments, scalp consultations and personalised guidance.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {consultations.slice(0, 6).map((c) => (
            <Card key={c.id}>
              <h3 className="font-display text-lg text-brand-700">{c.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{c.short_description}</p>
              <p className="mt-2 text-sm font-bold text-brand-900">
                {formatNaira(c.price_kobo)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- products */}
      <section className="bg-brand-50" id="products">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
            Complete Your Routine With Recommended Products
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.slice(0, 8).map((p) => (
              <Card key={p.id} className="text-center">
                <ArtBlock seed={p.slug} className="h-24" />
                <h3 className="mt-3 text-[15px] font-semibold">{p.name}</h3>
                <p className="mt-0.5 text-sm font-bold text-brand-700">
                  {formatNaira(p.price_kobo)}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- final CTA */}
      <section className="mx-auto w-full max-w-3xl px-4 py-14 text-center">
        <h2 className="font-display text-3xl text-brand-900">
          Ready to Join the Club?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Choose your membership, activate it, and reserve your first visit at
          a Sisters Lounge Salon.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/plans">Become a Member</ButtonLink>
          <ButtonLink href="/register" variant="ghost">
            Create an Account
          </ButtonLink>
        </div>
        <p className="mt-6 text-xs text-ink-soft">
          Online payment activation arrives in the next release — your
          membership selection is saved to your account until then.{" "}
          <Link href="/plans" className="underline">
            Browse memberships
          </Link>
        </p>
      </section>
    </>
  );
}
