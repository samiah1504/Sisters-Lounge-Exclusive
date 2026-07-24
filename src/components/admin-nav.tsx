"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/retention", label: "Retention" },
  { href: "/admin/upsell", label: "Upsell" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/extra-services", label: "Extras" },
  { href: "/admin/consultations", label: "Consultations" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/recommendations", label: "Recommendations" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="border-t border-line bg-white">
      <div className="scrollbar-none mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-2">
        {links.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
