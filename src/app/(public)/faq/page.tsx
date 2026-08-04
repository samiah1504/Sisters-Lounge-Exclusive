import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

const FAQS: Array<[string, string]> = [
  ["What does membership include?",
   "A set number of salon visits every month, valid at any open Sisters Lounge Salon. Your plan lists exactly which treatments are included; extra services can be added to any visit for an additional fee."],
  ["Can I walk in without a membership?",
   "No — Sisters Lounge is members-only. That is what keeps every visit calm, punctual and personal. You can become a member today and reserve your first visit right after activation."],
  ["Do unused visits roll over?",
   "No. Unused visits expire at the end of your monthly cycle. We remind you before you lose one, and the 7-day spacing between visits is designed so a full month comfortably fits your plan."],
  ["Why must visits be 7 days apart?",
   "Consistency beats intensity for natural hair. Weekly spacing protects your hair, keeps chairs available for every member, and builds the routine that gets results."],
  ["Can I cancel my membership?",
   "An already-paid cycle runs to its end and is not refundable, but you can switch off renewal at any time from your dashboard — no calls, no questions. Membership changes take effect from your next cycle."],
  ["What happens if I miss a reserved visit?",
   "Your visit returns to your balance — we never take it. Please reschedule ahead when plans change: repeated no-shows lead to a gentle warning and can briefly pause online reservations (the salon team can always reserve for you)."],
  ["Can I use my membership in another city?",
   "Yes. Your membership is valid at every open Sisters Lounge Salon nationwide — reserve wherever suits you."],
  ["Who does my hair?",
   "The salon assigns your stylist and you meet them at check-in. Every Sisters Lounge stylist works to the same standard, so your care is consistent whoever holds the comb."],
  ["How do I pay?",
   "For now, payment is confirmed by our team via transfer or at the salon — online card payment is coming. Your membership activates as soon as payment is confirmed."],
  ["Do you take children?",
   "Yes — Kids memberships are managed from a parent's account, with each child's history and preferences kept on their own profile."],
];

export default function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">
        Frequently Asked Questions
      </h1>
      <div className="mt-6 grid gap-3">
        {FAQS.map(([q, a]) => (
          <details key={q} className="rounded-2xl border border-line bg-white px-4 py-3">
            <summary className="cursor-pointer font-semibold">{q}</summary>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
