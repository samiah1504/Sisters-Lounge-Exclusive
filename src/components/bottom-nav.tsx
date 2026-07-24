"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home", icon: "⌂", exact: true },
  { href: "/app/book", label: "Book", icon: "✚", exact: false },
  { href: "/app/appointments", label: "Visits", icon: "▤", exact: false },
  { href: "/app/products", label: "Shop", icon: "❖", exact: false },
  { href: "/app/profile", label: "Profile", icon: "◉", exact: false },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="App navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  active ? "text-brand-600" : "text-ink-soft"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
