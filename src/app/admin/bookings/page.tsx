import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatDateTime, formatNaira } from "@/lib/format";
import { AppointmentStatusBadge, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Reserved Visits" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "pending", label: "Needs action" },
  { key: "with-addons", label: "With add-ons" },
  { key: "completed", label: "Completed" },
  { key: "missed", label: "Missed" },
  { key: "all", label: "All" },
];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; date?: string; salon?: string }>;
}) {
  await requireStaffOrAdmin();
  const { filter = "upcoming", q, date, salon } = await searchParams;
  const supabase = await createClient();
  // v3 §7.4: serving-salon filter (shown once there is more than one salon).
  const { data: salonList } = await supabase
    .from("salons").select("id, city").in("status", ["open", "paused"])
    .order("created_at");

  let query = supabase
    .from("appointments")
    .select(
      "id, starts_at, status, addon_total_kobo, salon:salons(name, city), " +
        "service:services(name), child:children(full_name), " +
        "customer:customer_profiles(id, profile:profiles(full_name, phone)), " +
        "stylist:profiles!appointments_stylist_profile_id_fkey(full_name), " +
        "extras:appointment_extra_services(id)",
    )
    .order("starts_at", { ascending: filter === "completed" || filter === "missed" || filter === "all" ? false : true })
    .limit(100);
  if (salon) query = query.eq("salon_id", salon);

  const nowIso = new Date().toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  switch (filter) {
    case "today":
      query = query
        .gte("starts_at", `${today}T00:00:00+01:00`)
        .lte("starts_at", `${today}T23:59:59+01:00`);
      break;
    case "pending":
      query = query.in("status", ["pending_confirmation", "pending_addon_payment"]);
      break;
    case "with-addons":
      query = query.gt("addon_total_kobo", 0);
      break;
    case "completed":
      query = query.eq("status", "completed");
      break;
    case "missed":
      query = query.eq("status", "missed");
      break;
    case "all":
      break;
    default:
      query = query
        .gte("starts_at", nowIso)
        .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned", "arrived", "in_service"]);
  }
  if (date) {
    query = query
      .gte("starts_at", `${date}T00:00:00+01:00`)
      .lte("starts_at", `${date}T23:59:59+01:00`);
  }

  const { data } = await query;
  let rows = (data ?? []) as Row[];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const cust = r.customer as unknown as { profile: { full_name: string; phone: string | null } };
      const child = r.child as unknown as { full_name: string } | null;
      return (
        cust?.profile?.full_name?.toLowerCase().includes(needle) ||
        cust?.profile?.phone?.includes(q) ||
        child?.full_name?.toLowerCase().includes(needle)
      );
    });
  }

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Reserved Visits</h1>

      <form className="flex flex-wrap gap-2" action="/admin/bookings" method="get">
        <input type="hidden" name="filter" value={filter} />
        <input
          type="search" name="q" defaultValue={q ?? ""}
          placeholder="Search customer or child…"
          className="min-h-11 flex-1 rounded-xl border border-line bg-white px-3.5 text-[15px] outline-none focus:border-brand-600"
        />
        <input
          type="date" name="date" defaultValue={date ?? ""}
          className="min-h-11 rounded-xl border border-line bg-white px-3 text-[15px]"
        />
        <button className="rounded-xl bg-brand-600 px-4 font-semibold text-white">Filter</button>
      </form>

      {(salonList ?? []).length > 1 && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          <Link href={`/admin/bookings?filter=${filter}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${!salon ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
            All salons
          </Link>
          {(salonList ?? []).map((x) => (
            <Link key={x.id} href={`/admin/bookings?filter=${filter}&salon=${x.id}`}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${salon === x.id ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
              {x.city}
            </Link>
          ))}
        </div>
      )}

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/bookings?filter=${f.key}${salon ? `&salon=${salon}` : ""}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${filter === f.key ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No bookings" message="Nothing matches this filter." />
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r) => {
            const cust = r.customer as unknown as { id: string; profile: { full_name: string } };
            const child = r.child as unknown as { full_name: string } | null;
            const stylist = r.stylist as unknown as { full_name: string } | null;
            return (
              <Link key={r.id} href={`/admin/bookings/${r.id}`}>
                <Card className="hover:border-brand-400">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {cust?.profile?.full_name}
                        {child && <span className="text-ink-soft"> → {child.full_name}</span>}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {(r.service as unknown as { name: string })?.name} · {formatDateTime(r.starts_at)}
                        {r.salon ? ` · ${(r.salon as unknown as { city: string }).city}` : ""}
                      </p>
                      <p className="text-sm">
                        {stylist ? (
                          <span className="text-emerald-700">Stylist: {stylist.full_name}</span>
                        ) : (
                          <span className="text-amber-700">No stylist assigned</span>
                        )}
                        {r.addon_total_kobo > 0 && (
                          <span className="text-brand-700">
                            {" "}· add-ons {formatNaira(r.addon_total_kobo)}
                          </span>
                        )}
                      </p>
                    </div>
                    <AppointmentStatusBadge status={r.status} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
