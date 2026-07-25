import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { expiryStatus, stockLevel } from "@/lib/operations";
import { formatNaira, lagosDateOf } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Inventory Alerts" };
export const dynamic = "force-dynamic";

function Section({ title, tone, rows, detail }: {
  title: string; tone: "red" | "amber" | "gray";
  rows: Row[]; detail: (i: Row) => string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <Badge tone={rows.length === 0 ? "green" : tone}>{rows.length}</Badge>
      </div>
      {rows.length > 0 && (
        <ul className="mt-2 grid gap-1.5 text-sm">
          {rows.map((i) => (
            <li key={i.id}>
              <Link href={`/admin/inventory/${i.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-50">
                <span className="font-medium">{i.name}</span>
                <span className="text-ink-soft">{detail(i)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function InventoryAlertsPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const [{ data: items }, { data: settings }, { data: adjustments }] = await Promise.all([
    supabase.from("inventory_items").select("*").is("archived_at", null).eq("is_active", true),
    supabase.from("inventory_settings").select("*").limit(1),
    supabase.from("inventory_movements")
      .select("*, item:inventory_items(name)")
      .in("movement_type", ["stock_count_correction", "manual_adjustment", "theft_or_loss", "damage"])
      .order("created_at", { ascending: false }).limit(20),
  ]);
  const s = settings?.[0];
  const today = lagosDateOf(new Date());
  const all = (items ?? []) as Row[];
  const consumables = all.filter((i) => i.item_type !== "equipment");

  const outOfStock = consumables.filter((i) => stockLevel(i as never) === "out_of_stock");
  const lowStock = consumables.filter((i) => stockLevel(i as never) === "low_stock");
  const expired = all.filter((i) => expiryStatus(i.expiry_date, s?.expiry_warning_days ?? 30, today) === "expired");
  const expiring = all.filter((i) => expiryStatus(i.expiry_date, s?.expiry_warning_days ?? 30, today) === "expiring_soon");
  const noSupplier = consumables.filter((i) => !i.supplier_id);
  const negative = all.filter((i) => Number(i.quantity_on_hand) < 0);
  const highValueAdjustments = ((adjustments ?? []) as Row[]).filter(
    (m) => Number(m.cost_value_kobo) >= (s?.high_value_adjustment_kobo ?? 5000000));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Inventory Alerts</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Expiry warning window: {s?.expiry_warning_days ?? 30} days · negative
          stock {s?.allow_negative_stock ? "allowed" : "blocked"} · high-value
          adjustment threshold {formatNaira(s?.high_value_adjustment_kobo ?? 0)}.
        </p>
      </div>

      {negative.length > 0 && (
        <Section title="Negative stock — data errors" tone="red" rows={negative}
          detail={(i) => `${Number(i.quantity_on_hand)} ${i.unit}`} />
      )}
      <Section title="Out of stock" tone="red" rows={outOfStock}
        detail={(i) => `reorder ${Number(i.reorder_quantity) || "?"} ${i.unit}`} />
      <Section title="At or below reorder level" tone="amber" rows={lowStock}
        detail={(i) => `${Number(i.quantity_available)} left · reorder at ${Number(i.reorder_level)}`} />
      <Section title="Expired items" tone="red" rows={expired}
        detail={(i) => `expired ${i.expiry_date}`} />
      <Section title="Expiring soon" tone="amber" rows={expiring}
        detail={(i) => `expires ${i.expiry_date}`} />
      <Section title="No supplier set" tone="gray" rows={noSupplier}
        detail={() => "add a supplier for reordering"} />

      <Card>
        <p className="font-semibold">Recent adjustments & losses</p>
        {highValueAdjustments.length > 0 && (
          <p className="mt-1 text-sm text-red-700">
            {highValueAdjustments.length} high-value adjustment(s) above the threshold — review below.
          </p>
        )}
        {((adjustments ?? []) as Row[]).length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No adjustments recorded.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {((adjustments ?? []) as Row[]).map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>
                  {(m.item as { name: string })?.name} · {m.movement_type.replace(/_/g, " ")}
                  {m.reason && <span className="text-ink-soft"> — {m.reason}</span>}
                </span>
                <span className={Number(m.cost_value_kobo) >= (s?.high_value_adjustment_kobo ?? 0) ? "font-bold text-red-700" : "text-ink-soft"}>
                  {Number(m.quantity)} · {formatNaira(m.cost_value_kobo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
