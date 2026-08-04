import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { formatDate } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Salons" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "gold" | "amber" | "gray" | "brand"> = {
  open: "green", waitlist: "gold", planned: "brand", paused: "amber", closed: "gray",
};

export default async function AdminSalonsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: salons }, { data: waitlist }, { data: subs }, { data: appts }] =
    await Promise.all([
      supabase.from("salons").select("*").order("created_at"),
      supabase.from("city_waitlist").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("home_salon_id")
        .in("status", ["active", "expiring_soon", "renewal_due"]),
      supabase.from("appointments").select("salon_id")
        .gte("starts_at", new Date().toISOString())
        .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"]),
    ]);

  const homeCounts = new Map<string, number>();
  for (const s of subs ?? []) {
    homeCounts.set(s.home_salon_id, (homeCounts.get(s.home_salon_id) ?? 0) + 1);
  }
  const upcomingCounts = new Map<string, number>();
  for (const a of appts ?? []) {
    upcomingCounts.set(a.salon_id, (upcomingCounts.get(a.salon_id) ?? 0) + 1);
  }

  // Waitlist as an expansion decision tool: demand per city, newest first.
  const byCity = new Map<string, Row[]>();
  for (const w of (waitlist ?? []) as Row[]) {
    const key = w.city.trim();
    byCity.set(key, [...(byCity.get(key) ?? []), w]);
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Salons</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Every Sisters Lounge Salon — open, paused and coming soon — plus
            the city waitlists that decide where we open next.
          </p>
        </div>
        <ButtonLink href="/admin/salons/new">New Salon</ButtonLink>
      </div>

      <div className="grid gap-3">
        {((salons ?? []) as Row[]).map((s) => (
          <Link key={s.id} href={`/admin/salons/${s.id}`}>
            <Card className="hover:border-brand-400">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-ink-soft">
                    {s.city}, {s.state} · {s.chair_capacity} chairs
                    {s.launch_date && ` · ${s.status === "open" ? "opened" : "launching"} ${formatDate(s.launch_date)}`}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {homeCounts.get(s.id) ?? 0} home member{(homeCounts.get(s.id) ?? 0) !== 1 ? "s" : ""}
                    {" · "}{upcomingCounts.get(s.id) ?? 0} upcoming visit{(upcomingCounts.get(s.id) ?? 0) !== 1 ? "s" : ""}
                    {byCity.get(s.city)?.length
                      ? ` · ${byCity.get(s.city)!.length} on the ${s.city} waitlist`
                      : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[s.status] ?? "gray"}>{s.status}</Badge>
              </div>
            </Card>
          </Link>
        ))}
        {(salons ?? []).length === 0 && (
          <EmptyState title="No salons yet" message="Create the first salon to get started." />
        )}
      </div>

      {/* ---------------------------------------- expansion decision tool -- */}
      <Card>
        <p className="font-semibold">City waitlists — where to open next</p>
        <p className="mt-1 text-sm text-ink-soft">
          Signups captured on the public Salons page, ranked by demand. A city
          with strong numbers is a launch with members already committed.
        </p>
        {cities.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No waitlist signups yet.</p>
        ) : (
          <div className="mt-3 grid gap-2.5">
            {cities.map(([city, rows]) => (
              <details key={city} className="rounded-xl border border-line bg-white px-3 py-2.5">
                <summary className="flex cursor-pointer items-center justify-between">
                  <span className="font-semibold">{city}</span>
                  <Badge tone={rows.length >= 20 ? "green" : rows.length >= 5 ? "gold" : "gray"}>
                    {rows.length} signup{rows.length !== 1 ? "s" : ""}
                  </Badge>
                </summary>
                <ul className="mt-2 grid gap-1 text-sm">
                  {rows.map((w) => (
                    <li key={w.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1.5">
                      <span>{w.full_name || "—"}</span>
                      <span className="text-ink-soft">
                        {w.contact_type === "whatsapp" ? (
                          <a className="font-semibold text-brand-600 hover:underline"
                            href={`https://wa.me/${String(w.contact).replace(/\D/g, "")}`}>
                            {w.contact}
                          </a>
                        ) : (
                          <a className="font-semibold text-brand-600 hover:underline"
                            href={`mailto:${w.contact}`}>
                            {w.contact}
                          </a>
                        )}
                        {" · "}{formatDate(w.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
