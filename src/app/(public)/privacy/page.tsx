import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

const SECTIONS: Array<[string, string[]]> = [
  ["What we collect", [
    "Account details: your name, phone number, WhatsApp number, email and address.",
    "Membership and visit records: your plan, cycles, reserved and completed visits, and add-on services.",
    "Children's profiles you create: name, date of birth, allergies, sensitivities and hair-care notes — provided by you as the parent or guardian.",
    "Messages you send us through Chat with Us.",
  ]],
  ["How we use it", [
    "To run your membership: reserving visits, tracking your visit balance, and reminding you before visits or before unused visits expire.",
    "To care for your (or your child's) hair safely — allergies and sensitivities are visible to the stylists serving you.",
    "To improve Sisters Lounge — always on aggregated, de-identified information.",
    "We do not sell your data, and we do not share it with third parties except the service providers that run our infrastructure.",
  ]],
  ["Children's information", [
    "Children's profiles exist only under a parent's account and are managed entirely by the parent.",
    "In line with the Nigeria Data Protection Act 2023, we treat children's information with heightened care: access is limited to the staff serving the child, and photo features remain off by default.",
  ]],
  ["Your choices", [
    "You can update your details and notification preferences from your profile at any time.",
    "Marketing messages are strictly opt-in and can be switched off whenever you like.",
    "You may ask us to correct or delete your personal information — message us via Chat with Us or any salon's contact channels. Deletion is real: records not legally required to be kept are removed.",
  ]],
  ["Security & retention", [
    "Your data is stored with access controls that limit every staff member to what their role requires, enforced at the database level.",
    "We keep membership records only for as long as needed to operate your membership and meet legal obligations.",
  ]],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">Privacy Policy</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Written to be read. Questions? Message us via Chat with Us.
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
