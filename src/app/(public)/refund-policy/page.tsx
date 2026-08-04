import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refund Policy" };

const SECTIONS: Array<[string, string[]]> = [
  ["Memberships", [
    "Membership fees are paid monthly in advance and are non-refundable once a cycle has started.",
    "An active cycle cannot be cancelled or paused; it runs to its end date with all its visits available to you.",
    "If you do not wish to continue, switch off renewal from your dashboard — you will not be charged again, and no cancellation fee applies.",
  ]],
  ["Visits", [
    "Unused visits expire at cycle end and are not convertible to cash or credit.",
    "If the salon cancels or releases your reserved visit — including a temporary salon closure — the visit returns to your balance at no cost, and we help you reserve at any open salon.",
  ]],
  ["Add-ons and Expert Consultations", [
    "Add-on services cancelled by the salon are not charged; prepaid amounts for salon-cancelled services are credited or returned.",
    "Expert Consultation fees follow the price confirmed to you at booking, including any membership benefit applied.",
  ]],
  ["Products", [
    "Unopened products in their original condition may be returned at the salon within 7 days of purchase with proof of purchase.",
    "Opened personal-care products cannot be returned for hygiene reasons, unless faulty.",
  ]],
  ["How refunds are handled", [
    "Approved refunds and credits are processed by the salon team via the payment method used, typically within 7 business days.",
    "If anything here seems unfair in your specific situation, talk to us — Chat with Us from your dashboard or speak to your salon. Fairness beats fine print.",
  ]],
];

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">Refund Policy</h1>
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
