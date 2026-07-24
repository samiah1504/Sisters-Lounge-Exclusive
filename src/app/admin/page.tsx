import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { formatDateTime } from "@/lib/format";
import { AppointmentStatusBadge, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Admin Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [
    { count: customers },
    { count: activeSubs },
    { count: upcoming },
    { count: pendingSelections },
    { data: nextBookings },
  ] = await Promise.all([
    supabase.from("customer_profiles").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true })
      .in("status", ["active", "expiring_soon", "renewal_due"]),
    supabase.from("appointments").select("id", { count: "exact", head: true })
      .gte("starts_at", now)
      .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"]),
    supabase.from("pending_plan_selections").select("id", { count: "exact", head: true })
      .eq("status", "pending_payment"),
    supabase
      .from("appointments")
      .select("id, starts_at, status, service:services(name), customer:customer_profiles(profile:profiles(full_name))")
      .gte("starts_at", now)
      .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"])
      .order("starts_at")
      .limit(8),
  ]);

  const stats = [
    { label: "Customers", value: customers ?? 0, href: "/admin/customers" },
    { label: "Active subscriptions", value: activeSubs ?? 0, href: "/admin/customers" },
    { label: "Upcoming bookings", value: upcoming ?? 0, href: "/admin/bookings" },
    { label: "Pending plan selections", value: pendingSelections ?? 0, href: "/admin/retention" },
  ];

  return (
    <div className="grid gap-5">
      <h1 className="heading-rule font-display text-2xl text-ink">Overview</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:border-brand-400">
              <p className="font-display text-3xl font-bold text-brand-900">{s.value}</p>
              <p className="text-sm text-ink-soft">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <p className="font-semibold">Next bookings</p>
        {(nextBookings ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No upcoming bookings.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {(nextBookings ?? []).map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-sm hover:border-brand-400"
                >
                  <span>
                    <span className="font-semibold">
                      {(b.customer as unknown as { profile: { full_name: string } })?.profile?.full_name ?? "Customer"}
                    </span>{" "}
                    · {(b.service as unknown as { name: string })?.name}
                    <span className="block text-ink-soft">{formatDateTime(b.starts_at)}</span>
                  </span>
                  <AppointmentStatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
