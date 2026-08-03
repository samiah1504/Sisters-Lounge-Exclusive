"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

const links = [
  { href: "/", label: "Home" },
  { href: "/plans", label: "Membership Plans" },
  { href: "/salons", label: "Salons" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#consultations", label: "Expert Consultations" },
  { href: "/#products", label: "Shop" },
  { href: "/login", label: "Sign In" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-display text-lg font-bold text-ink">
          <span className="mr-1 text-gold-600">✦</span>
          Sisters Lounge <em className="not-italic text-brand-600">Exclusive</em>
        </Link>
        <button
          className="rounded-xl border border-line p-3 lg:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Toggle menu</span>
          <span className="block h-0.5 w-5 bg-ink" />
          <span className="mt-1 block h-0.5 w-5 bg-ink" />
          <span className="mt-1 block h-0.5 w-5 bg-ink" />
        </button>
        <div
          id="site-menu"
          className={`${open ? "flex" : "hidden"} absolute inset-x-0 top-full flex-col gap-1 border-b border-line bg-cream px-4 pb-4 pt-2 shadow-card lg:static lg:flex lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-[15px] text-ink-soft hover:bg-brand-50 hover:text-brand-600"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className={buttonClass("primary", "mt-2 lg:ml-2 lg:mt-0")}
          >
            Become a Member
          </Link>
        </div>
      </nav>
    </header>
  );
}
