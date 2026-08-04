import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { formatNaira } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/**
 * v3 §7.4 — the two reporting dimensions must never be conflated:
 * memberships belong to a HOME salon (attribution), visits happen at a
 * SERVING salon (capacity/operations). Cross-salon flow gets its own view.
 */
export default async function AdminReportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;

  const [{ data: salons }, { data: subs }, { data: appts }, { data: noShows }] =
    await Promise.all([
      supabase.from("salons").select("id, name, city, status").order("created_at"),
      supabase.from("subscriptions")
        .select("home_salon_id, status, plan:subscription_plans(monthly_price_kobo)")
        .in("status", ["active", "expiring_soon", "renewal_due"]),
      supabase.from("appointments")
        .select("salon_id, status, starts_at, subscription:subscriptions(home_salon_id)")
        .gte("starts_at", `${monthStart}T00:00:00+01:00`),
      supabase.from("member_no_shows").select("salon_id, occurred_at")
        .gte("occurred_at", `${monthStart}T00:00:00+01:00`),
    ]);

  const salonRows = (salons ?? []) as Row[];
  const nameOf = new Map(salonRows.map((s) => [s.id, s.city as string]));

  /* ---- memberships by HOME salon (attribution) ---- */
  const home = new Map<string, { count: number; valueKobo: number }>();
  for (const s of (subs ?? []) as Row[]) {
    const prev = home.get(s.home_salon_id) ?? { count: 0, valueKobo: 0 };
    home.set(s.home_salon_id, {
      count: prev.count + 1,
      valueKobo: prev.valueKobo + ((s.plan as Row)?.monthly_price_kobo ?? 0),
    });
  }

  /* ---- visits by SERVING salon (operations, this month) ---- */
  const serving = new Map<string, { completed: number; upcoming: number; missed: number }>();
  const flows = new Map<string, number>(); // "home→serving" for cross-salon
  for (const a of (appts ?? []) as Row[]) {
    const cur = serving.get(a.salon_id) ?? { completed: 0, upcoming: 0, missed: 0 };
    if (a.status === "completed") cur.completed += 1;
    else if (a.status === "missed") cur.missed += 1;
    else if (["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"].includes(a.status)) {
      cur.upcoming += 1;
    }
    serving.set(a.salon_id, cur);

    const homeSalon = (a.subscription as Row)?.home_salon_id;
    if (homeSalon && homeSalon !== a.salon_id
        && !["cancelled_salon", "cancelled_admin", "expired", "no_longer_eligible"].includes(a.status)) {
      const key = `${homeSalon}→${a.salon_id}`;
      flows.set(key, (flows.get(key) ?? 0) + 1);
    }
  }

  const noShowBySalon = new Map<string, number>();
  for (const n of (noShows ?? []) as Row[]) {
    noShowBySalon.set(n.salon_id, (noShowBySalon.get(n.salon_id) ?? 0) + 1);
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Reports</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Memberships are attributed to their <strong>home salon</strong>;
          visits are counted at the <strong>serving salon</strong>. The two
          are deliberately separate.
        </p>
      </div>

      {/* -------------------- memberships by home salon (attribution) ---- */}
      <Card>
        <p className="font-semibold">Memberships by home salon</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-1.5">Salon</th>
                <th className="py-1.5 text-right">Active memberships</th>
                <th className="py-1.5 text-right">Monthly value*</th>
              </tr>
            </thead>
            <tbody>
              {salonRows.map((s) => {
                const h = home.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-1.5 font-medium">{s.city}
                      {s.status !== "open" && <Badge tone="gray">{s.status}</Badge>}
                    </td>
                    <td className="py-1.5 text-right">{h?.count ?? 0}</td>
                    <td className="py-1.5 text-right">{formatNaira(h?.valueKobo ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          *Sum of current plan prices for active memberships — a run-rate,
          not collected revenue (payments are recorded manually).
        </p>
      </Card>

      {/* ----------------- visits by serving salon (operations, month) --- */}
      <Card>
        <p className="font-semibold">Visits by serving salon — this month</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-1.5">Salon</th>
                <th className="py-1.5 text-right">Completed</th>
                <th className="py-1.5 text-right">Upcoming</th>
                <th className="py-1.5 text-right">Missed</th>
                <th className="py-1.5 text-right">No-shows recorded</th>
              </tr>
            </thead>
            <tbody>
              {salonRows.map((s) => {
                const v = serving.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-1.5 font-medium">{s.city}</td>
                    <td className="py-1.5 text-right">{v?.completed ?? 0}</td>
                    <td className="py-1.5 text-right">{v?.upcoming ?? 0}</td>
                    <td className="py-1.5 text-right">{v?.missed ?? 0}</td>
                    <td className="py-1.5 text-right">{noShowBySalon.get(s.id) ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --------------------------- cross-salon flow (v3 §7.4, #33) ----- */}
      <Card>
        <p className="font-semibold">Cross-salon visits — members served away from home</p>
        <p className="mt-1 text-sm text-ink-soft">
          A member of salon A served at salon B. Watch this the week a new
          city opens — it shows real portability demand.
        </p>
        {flows.size === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No cross-salon visits this month.
          </p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {[...flows.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => {
                const [from, to] = key.split("→");
                return (
                  <li key={key} className="flex justify-between gap-2">
                    <span>
                      <span className="font-medium">{nameOf.get(from) ?? "?"}</span>
                      <span className="text-ink-soft"> members served at </span>
                      <span className="font-medium">{nameOf.get(to) ?? "?"}</span>
                    </span>
                    <span className="font-semibold">{count} visit{count !== 1 ? "s" : ""}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </div>
  );
}
