import type { Metadata } from "next";

export const metadata: Metadata = { title: "Membership Terms" };

const SECTIONS: Array<[string, string[]]> = [
  ["Membership", [
    "Sisters Lounge is a members-only service. Salon visits are available exclusively to members with an active membership.",
    "Every membership runs for one monthly cycle from its activation date and includes the number of visits stated on the plan.",
    "Memberships are personal (or, for Kids plans, personal to the named child) and cannot be shared or transferred.",
  ]],
  ["Visits", [
    "Visits are reserved in advance and must be at least 7 days apart (unless your plan states otherwise).",
    "Unused visits expire at the end of the monthly cycle and do not roll over.",
    "A reserved visit is only used once your appointment is completed. Visits released by the salon (for example if a salon is temporarily closed) return to your balance at no cost to you.",
    "Your membership is valid at every open Sisters Lounge Salon.",
    "Stylists are assigned by the salon and confirmed at check-in.",
  ]],
  ["Missed visits", [
    "If you miss a reserved visit without rescheduling, the visit returns to your balance — it is not forfeited.",
    "Repeated missed visits are recorded. After the published thresholds, we may briefly pause new online reservations; the salon team can always reserve on your behalf.",
    "Please reschedule ahead of the published notice window when your plans change.",
  ]],
  ["Payments, renewal and cancellation", [
    "Membership fees are payable monthly in advance. Payment is currently confirmed manually by our team; online payment is coming.",
    "An already-paid cycle runs to its end date and cannot be cancelled, paused or refunded.",
    "You may switch off renewal at any time from your dashboard; your membership then simply ends at the close of the paid cycle.",
    "Membership plan changes take effect from your next cycle.",
    "Add-on services and Expert Consultations are charged separately at the prices shown to you before you confirm.",
  ]],
  ["General", [
    "Prices are national — the same at every Sisters Lounge Salon — and stated in Nigerian Naira.",
    "We may update these terms; material changes will be communicated to members in advance and apply from your next cycle.",
    "These terms are governed by the laws of the Federal Republic of Nigeria.",
  ]],
];

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">Membership Terms</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Plain language on purpose — these are the same rules shown on every
        membership plan before you join.
      </p>
      {SECTIONS.map(([title, items]) => (
        <section key={title} className="mt-7">
          <h2 className="font-display text-xl text-brand-900">{title}</h2>
          <ul className="mt-2 grid gap-1.5 rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed text-ink-soft">
            {items.map((i) => <li key={i}>• {i}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
