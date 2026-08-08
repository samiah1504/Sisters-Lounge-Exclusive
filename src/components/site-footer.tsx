import Link from "next/link";

const COLUMNS: Array<[string, Array<[string, string]>]> = [
  ["The Club", [
    ["About", "/about"],
    ["Membership Plans", "/plans"],
    ["Salons & Waitlists", "/salons"],
    ["Treatments", "/treatments"],
  ]],
  ["Help", [
    ["FAQ", "/faq"],
    ["Contact", "/contact"],
    ["Become a Member", "/register"],
    ["Sign In", "/login"],
  ]],
  ["Legal", [
    ["Membership Terms", "/terms"],
    ["Privacy Policy", "/privacy"],
    ["Refund Policy", "/refund-policy"],
  ]],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-lg font-bold text-ink">
            <span className="mr-1 text-gold-600">✦</span>
            Sisters Lounge
          </p>
          <p className="mt-1.5 max-w-xs text-sm text-ink-soft">
            A Subscription-Based Salon for Natural Hair Care. Healthy
            natural hair through consistent professional care.
          </p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gold-600">
              {title}
            </p>
            <ul className="mt-2.5 grid gap-1.5 text-sm">
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-ink-soft hover:text-brand-600">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line py-4">
        <p className="mx-auto w-full max-w-6xl px-4 text-sm text-ink-soft">
          © {new Date().getFullYear()} Sisters Lounge. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
