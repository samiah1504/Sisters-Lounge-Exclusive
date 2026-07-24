import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatNaira } from "@/lib/format";
import { Badge, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Upsell" };
export const dynamic = "force-dynamic";

export default async function AdminUpsellPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();

  const [{ data: appts }, { data: addonRows }, { data: favs }, { data: intents }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("id, addon_total_kobo, status, subscription:subscriptions(plan:subscription_plans(name))")
        .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned", "arrived", "in_service", "completed"]),
      supabase
        .from("appointment_extra_services")
        .select("price_kobo, extra_service:extra_services(name)"),
      supabase.from("favourites").select("item_type, item_id"),
      supabase
        .from("pending_payment_intents")
        .select("amount_kobo, purpose, status")
        .eq("status", "pending"),
    ]);

  const all = appts ?? [];
  const withAddons = all.filter((a) => a.addon_total_kobo > 0);
  const totalSelected = withAddons.reduce((t, a) => t + a.addon_total_kobo, 0);
  const avgSelected = withAddons.length > 0 ? Math.round(totalSelected / withAddons.length) : 0;
  const pendingAddonValue = (intents ?? [])
    .filter((i) => i.purpose === "addon_payment")
    .reduce((t, i) => t + i.amount_kobo, 0);

  // Most-selected extras.
  const extraCounts = new Map<string, { count: number; value: number }>();
  for (const r of addonRows ?? []) {
    const name = (r.extra_service as unknown as { name: string })?.name ?? "—";
    const cur = extraCounts.get(name) ?? { count: 0, value: 0 };
    extraCounts.set(name, { count: cur.count + 1, value: cur.value + r.price_kobo });
  }
  const topExtras = [...extraCounts.entries()].sort((a, b) => b[1].count - a[1].count);

  // Plans with highest add-on selection.
  const planCounts = new Map<string, { appts: number; withAddons: number }>();
  for (const a of all) {
    const plan =
      ((a.subscription as unknown as { plan: { name: string } } | null)?.plan?.name) ?? "No plan";
    const cur = planCounts.get(plan) ?? { appts: 0, withAddons: 0 };
    planCounts.set(plan, {
      appts: cur.appts + 1,
      withAddons: cur.withAddons + (a.addon_total_kobo > 0 ? 1 : 0),
    });
  }

  // Product favourites.
  const favProductCounts = new Map<string, number>();
  for (const f of favs ?? []) {
    if (f.item_type !== "product") continue;
    favProductCounts.set(f.item_id, (favProductCounts.get(f.item_id) ?? 0) + 1);
  }
  const { data: favProducts } = await supabase
    .from("products")
    .select("id, name")
    .in("id", [...favProductCounts.keys()].length > 0 ? [...favProductCounts.keys()] : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Upsell</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Add-on adoption across bookings. Live payments are not active — all
          monetary figures are <strong>selected / pending value</strong>, not
          collected revenue.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="font-display text-3xl font-bold text-brand-900">{withAddons.length}</p>
          <p className="text-sm text-ink-soft">Bookings with add-ons</p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold text-brand-900">
            {all.length - withAddons.length}
          </p>
          <p className="text-sm text-ink-soft">Bookings without add-ons</p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold text-brand-900">
            {formatNaira(avgSelected)}
          </p>
          <p className="text-sm text-ink-soft">Average selected add-on value</p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold text-brand-900">
            {formatNaira(pendingAddonValue)}
          </p>
          <p className="text-sm text-ink-soft">
            Add-on value pending payment <Badge tone="amber">pending value</Badge>
          </p>
        </Card>
      </div>

      <Card>
        <p className="font-semibold">Most-selected extra services</p>
        {topExtras.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No add-ons selected yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="py-1.5 font-medium">Extra service</th>
                <th className="py-1.5 font-medium">Times selected</th>
                <th className="py-1.5 text-right font-medium">Selected value</th>
              </tr>
            </thead>
            <tbody>
              {topExtras.map(([name, s]) => (
                <tr key={name} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium">{name}</td>
                  <td className="py-2">{s.count}</td>
                  <td className="py-2 text-right">{formatNaira(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Add-on selection by plan</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="py-1.5 font-medium">Plan</th>
              <th className="py-1.5 font-medium">Bookings</th>
              <th className="py-1.5 text-right font-medium">With add-ons</th>
            </tr>
          </thead>
          <tbody>
            {[...planCounts.entries()]
              .sort((a, b) => b[1].withAddons - a[1].withAddons)
              .map(([plan, s]) => (
                <tr key={plan} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium">{plan}</td>
                  <td className="py-2">{s.appts}</td>
                  <td className="py-2 text-right">
                    {s.withAddons} ({s.appts > 0 ? Math.round((s.withAddons / s.appts) * 100) : 0}%)
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <p className="font-semibold">Most-favourited products</p>
        {favProductCounts.size === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No favourites yet.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {[...favProductCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([id, count]) => (
                <li key={id} className="flex justify-between">
                  <span>{(favProducts ?? []).find((p) => p.id === id)?.name ?? "(archived product)"}</span>
                  <span className="font-semibold">{count} ♥</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card className="border-dashed">
        <p className="text-sm text-ink-soft">
          <strong>Recommendation conversion foundation:</strong> add-on
          selections and recommendation rules are both recorded, so once
          selections are attributed to the rule that suggested them (next
          phase), conversion rates appear here.
        </p>
      </Card>
    </div>
  );
}
