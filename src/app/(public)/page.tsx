import Link from "next/link";
import {
  getConsultationTypes,
  getPublicExtraServices,
  getPublicPlans,
  getPublicProducts,
} from "@/server/catalogue";
import { formatNaira } from "@/lib/format";
import { ArtBlock, ButtonLink, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [plans, extras, consultations, products] = await Promise.all([
    getPublicPlans(),
    getPublicExtraServices(),
    getConsultationTypes(),
    getPublicProducts(),
  ]);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="bg-gradient-to-b from-brand-50 to-cream">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">
              Monthly Hair-Care Membership
            </p>
            <h1 className="font-display text-4xl leading-tight text-brand-900 sm:text-5xl">
              Healthy Hair Care, Made&nbsp;Consistent
            </h1>
            <p className="mt-4 max-w-xl text-[17px] text-ink-soft">
              Choose a monthly Sisters Lounge plan, book your salon visits ahead
              and enjoy a more organised and consistent hair-care experience.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/plans">Explore Subscription Plans</ButtonLink>
              <ButtonLink href="#how-it-works" variant="ghost">
                How It Works
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-ink-soft">
              Plans available for adults, children, undergraduates and
              home-service customers within Ilorin.
            </p>
          </div>

          <div className="relative grid content-center gap-3 rounded-3xl bg-gradient-to-br from-brand-100/60 to-gold-100/60 p-5">
            <Card className="max-w-xs justify-self-start">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Active plan
              </p>
              <p className="font-bold text-brand-900">Deluxe · 3 visits / month</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
                <div className="h-full w-2/3 rounded-full bg-brand-600" />
              </div>
              <p className="mt-1 text-sm text-ink-soft">2 visits remaining</p>
            </Card>
            <Card className="max-w-xs justify-self-end">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gold-600">
                Next appointment
              </p>
              <p className="font-bold text-brand-900">Sat · 10:00 AM</p>
              <p className="text-sm text-ink-soft">Wash, treatment &amp; styling</p>
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

      {/* ----------------------------------------------------------- plans */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="plans">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Choose a Plan That Fits Your Hair-Care Routine
        </h2>
        <p className="mt-3 max-w-xl text-ink-soft">
          Every subscription runs for one monthly cycle with a set number of
          salon visits included.
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
                  View Plan
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
        {plans.length === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-line bg-brand-50 p-6 text-center text-sm text-ink-soft">
            Plans are being prepared — check back shortly.
          </p>
        )}
        <p className="mt-5 text-sm text-ink-soft">
          Subscription visits must be at least seven days apart. Unused visits
          expire at the end of the monthly cycle and cannot be carried forward.
          Missed appointments do not automatically consume a visit.
        </p>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="bg-brand-50" id="how-it-works">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
            Your Monthly Hair Care in Four Simple Steps
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Choose your subscription plan", "Pick the plan that matches your routine — adult, kids, undergraduate or home service."],
              ["Complete your payment", "Pay securely online and your monthly cycle starts right away."],
              ["Book your preferred appointment dates", "Reserve visits ahead, including weekends. Visits must be at least seven days apart."],
              ["Attend your visits and stay consistent", "Track visits used and remaining from your dashboard, with reminders before each one."],
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
            subscription cycle and cannot be carried forward.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------- extra services */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="extra-services">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Personalise Your Next Appointment
        </h2>
        <p className="mt-3 max-w-xl text-ink-soft">
          Subscribers can add extra services to any visit. Each add-on attracts
          an additional fee.
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
              Manage Your Family&apos;s Hair Care in One Place
            </h2>
            <p className="mt-3 max-w-xl text-ink-soft">
              Parents can create profiles for multiple children, track each
              child&apos;s subscription, book appointments and view their
              hair-care history — all from one account.
            </p>
            <div className="mt-5">
              <ButtonLink href="/register">Create Your Account</ButtonLink>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              ["A", "Aisha · Kids Plan", "1 of 2 visits used"],
              ["H", "Halima · Kids Plan", "Next visit: Saturday"],
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

      {/* ----------------------------------------------------consultations */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12" id="consultations">
        <h2 className="heading-rule font-display text-2xl text-ink sm:text-3xl">
          Get Professional Hair and Scalp Guidance
        </h2>
        <p className="mt-3 max-w-xl text-ink-soft">
          Book a one-on-one session with a Sisters Lounge professional.
          Consultations are charged separately from subscriptions.
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
          Ready to Make Hair Care More Consistent?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Choose your plan, complete your subscription and book your first
          Sisters Lounge visit.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/plans">View Plans</ButtonLink>
          <ButtonLink href="/register" variant="ghost">
            Create an Account
          </ButtonLink>
        </div>
        <p className="mt-6 text-xs text-ink-soft">
          Online payment activation arrives in the next release — plan selection
          is saved to your account until then.{" "}
          <Link href="/plans" className="underline">
            Browse plans
          </Link>
        </p>
      </section>
    </>
  );
}
