import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatNaira } from "@/lib/format";
import { stockLevel } from "@/lib/operations";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";
import { getStockTotals } from "@/server/stock";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const TYPE_LABEL = { consumable: "Consumable", retail: "Retail", equipment: "Equipment" } as const;

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; level?: string }>;
}) {
  const session = await requireStaffOrAdmin();
  const { type = "all", q, level } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("inventory_items")
    .select("*, category:inventory_categories(name), supplier:suppliers(name)")
    .is("archived_at", null)
    .order("name");
  if (type !== "all") query = query.eq("item_type", type);
  const [{ data }, totals] = await Promise.all([query, getStockTotals(supabase)]);
  let items = ((data ?? []) as Row[]).map((i): Row => {
    const t = totals.get(i.id) ?? { on_hand: 0, reserved: 0, available: 0 };
    return { ...i, quantity_on_hand: t.on_hand,
             quantity_reserved: t.reserved, quantity_available: t.available };
  });
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (i) => i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle),
    );
  }
  if (level) {
    items = items.filter((i) => stockLevel(i as never) === level);
  }
  const isAdmin = session.profile.role === "admin";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Inventory</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Consumables, retail stock and equipment. Quantities only move
            through the stock ledger — never edited directly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/inventory/receiving" variant="outline">Receive stock</ButtonLink>
          <ButtonLink href="/admin/inventory/counts" variant="outline">Stock counts</ButtonLink>
          {isAdmin && <ButtonLink href="/admin/inventory/new">Add item</ButtonLink>}
        </div>
      </div>

      <form className="flex gap-2" action="/admin/inventory" method="get">
        <input type="search" name="q" defaultValue={q ?? ""} placeholder="Search name or SKU…"
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] outline-none focus:border-brand-600" />
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        <button className="rounded-xl bg-brand-600 px-4 font-semibold text-white">Search</button>
      </form>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[["all", "All"], ["consumable", "Consumables"], ["retail", "Retail"], ["equipment", "Equipment"]].map(([k, label]) => (
          <Link key={k} href={`/admin/inventory?type=${k}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${type === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
            {label}
          </Link>
        ))}
        <Link href="/admin/inventory/alerts"
          className="shrink-0 rounded-full border border-gold-400 bg-gold-100 px-4 py-2 text-sm font-semibold text-gold-700">
          Alerts
        </Link>
        <Link href="/admin/inventory/categories"
          className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft">
          Categories
        </Link>
        <Link href="/admin/inventory/templates"
          className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft">
          Usage templates
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No items" message="Add your first inventory item to start tracking stock." />
      ) : (
        <div className="grid gap-2.5">
          {items.map((i) => {
            const lvl = stockLevel(i as never);
            return (
              <Link key={i.id} href={`/admin/inventory/${i.id}`}>
                <Card className="hover:border-brand-400">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {i.name}
                        <span className="ml-2 text-sm font-normal text-ink-soft">{i.sku}</span>
                      </p>
                      <p className="text-sm text-ink-soft">
                        {TYPE_LABEL[i.item_type as keyof typeof TYPE_LABEL]}
                        {i.category && ` · ${(i.category as { name: string }).name}`}
                        {" · cost "}{formatNaira(i.cost_price_kobo)}/{i.unit}
                        {i.supplier && ` · ${(i.supplier as { name: string }).name}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-right">
                        <span className="block font-display text-lg font-bold text-brand-900">
                          {Number(i.quantity_available)} {i.unit}
                        </span>
                        {Number(i.quantity_reserved) > 0 && (
                          <span className="text-xs text-ink-soft">
                            {Number(i.quantity_reserved)} reserved
                          </span>
                        )}
                      </span>
                      {i.item_type !== "equipment" && (
                        <Badge tone={lvl === "ok" ? "green" : lvl === "low_stock" ? "amber" : "red"}>
                          {lvl === "ok" ? "In stock" : lvl === "low_stock" ? "Low" : "Out"}
                        </Badge>
                      )}
                    </div>
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
