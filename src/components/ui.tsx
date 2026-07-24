import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ Button */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "transition-colors text-center min-h-11 px-5 py-2.5 text-[15px] " +
  "disabled:opacity-50 disabled:pointer-events-none";

const btnVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  ghost: "border border-brand-600 text-brand-600 hover:bg-brand-100",
  outline: "border border-line bg-white text-brand-600 hover:border-brand-600",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
  gold: "bg-gold-600 text-white hover:bg-gold-700",
} as const;

export function buttonClass(
  variant: keyof typeof btnVariants = "primary",
  extra = "",
): string {
  return `${btnBase} ${btnVariants[variant]} ${extra}`;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof btnVariants;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white p-4 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

const badgeTones = {
  brand: "bg-brand-100 text-brand-700",
  gold: "bg-gold-100 text-gold-700",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-700",
  gray: "bg-neutral-100 text-neutral-600",
  amber: "bg-amber-100 text-amber-800",
} as const;

export function Badge({
  tone = "brand",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

const APPOINTMENT_TONES: Record<string, keyof typeof badgeTones> = {
  pending_addon_payment: "amber",
  pending_confirmation: "amber",
  confirmed: "brand",
  assigned: "brand",
  arrived: "gold",
  in_service: "gold",
  completed: "green",
  missed: "red",
  cancelled_salon: "gray",
  cancelled_admin: "gray",
  no_longer_eligible: "gray",
  expired: "gray",
  draft: "gray",
  rescheduled: "amber",
};

const SUBSCRIPTION_TONES: Record<string, keyof typeof badgeTones> = {
  active: "green",
  expiring_soon: "amber",
  renewal_due: "amber",
  pending_payment: "amber",
  payment_failed: "red",
  expired: "gray",
  opted_out: "gray",
  suspended: "red",
  cancelled_by_admin: "gray",
  draft: "gray",
  archived: "gray",
};

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function AppointmentStatusBadge({ status }: { status: string }) {
  return <Badge tone={APPOINTMENT_TONES[status] ?? "gray"}>{statusLabel(status)}</Badge>;
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return <Badge tone={SUBSCRIPTION_TONES[status] ?? "gray"}>{statusLabel(status)}</Badge>;
}

/* ------------------------------------------------------------------- Forms */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-soft">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] " +
  "text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200 " +
  "min-h-11";

/* ----------------------------------------------------------- Empty / misc */

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-brand-50 px-6 py-10 text-center">
      <p className="font-display text-lg text-brand-900">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="heading-rule font-display text-xl text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
      <div
        className="h-full rounded-full bg-brand-600"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-brand-100/70 ${className}`} />
  );
}

/** Uniform placeholder art block (no fake photography). */
export function ArtBlock({
  seed,
  className = "",
}: {
  seed: string;
  className?: string;
}) {
  const palettes = [
    "from-brand-100 to-brand-400",
    "from-gold-100 to-gold-400",
    "from-brand-50 to-brand-600",
    "from-gold-100 to-brand-300",
    "from-brand-100 to-gold-500",
  ];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 997;
  const palette = palettes[h % palettes.length];
  return (
    <div
      aria-hidden
      className={`bg-gradient-to-br ${palette} rounded-xl ${className}`}
    />
  );
}
