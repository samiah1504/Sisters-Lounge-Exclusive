import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { signOut } from "@/server/actions/auth";
import { formatDateTime } from "@/lib/format";
import { AppointmentStatusBadge, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "My Bookings (Staff)" };
export const dynamic = "force-dynamic";

export default async function StaffBookingsPage() {
  const session = await requireStaffOrAdmin();
  const supabase = await createClient();

  // Staff see their own assigned appointments plus unassigned live bookings.
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, status, stylist_profile_id, service:services(name), " +
        "child:children(full_name), customer:customer_profiles(profile:profiles(full_name))",
    )
    .gte("starts_at", new Date(new Date().getTime() - 86_400_000).toISOString())
    .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned", "arrived", "in_service"])
    .order("starts_at")
    .limit(60);

  const rows = (data ?? []) as Row[];
  const mine = rows.filter((a) => a.stylist_profile_id === session.userId);
  const unassigned = rows.filter((a) => !a.stylist_profile_id);

  const BookingRow = ({ a }: { a: Row }) => (
    <Link href={`/admin/bookings/${a.id}`}>
      <Card className="flex items-center justify-between gap-2 hover:border-brand-400">
        <div>
          <p className="font-semibold">
            {(a.customer as unknown as { profile: { full_name: string } })?.profile?.full_name}
            {a.child && ` → ${(a.child as unknown as { full_name: string }).full_name}`}
          </p>
          <p className="text-sm text-ink-soft">
            {(a.service as unknown as { name: string })?.name} · {formatDateTime(a.starts_at)}
          </p>
        </div>
        <AppointmentStatusBadge status={a.status} />
      </Card>
    </Link>
  );

  return (
    <div className="min-h-dvh bg-cream">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <p className="font-display font-bold">
            <span className="mr-1 text-gold-600">✦</span>
            Sisters Lounge <span className="text-brand-600">Staff</span>
          </p>
          <form action={signOut}>
            <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-5">
        <section className="grid gap-2.5">
          <h2 className="font-semibold text-ink-soft">Assigned to me</h2>
          {mine.length === 0 ? (
            <EmptyState title="Nothing assigned" message="Appointments assigned to you appear here." />
          ) : (
            mine.map((a) => <BookingRow key={a.id} a={a} />)
          )}
        </section>
        <section className="grid gap-2.5">
          <h2 className="font-semibold text-ink-soft">Unassigned bookings</h2>
          {unassigned.length === 0 ? (
            <p className="text-sm text-ink-soft">All bookings are assigned.</p>
          ) : (
            unassigned.map((a) => <BookingRow key={a.id} a={a} />)
          )}
        </section>
      </main>
    </div>
  );
}
