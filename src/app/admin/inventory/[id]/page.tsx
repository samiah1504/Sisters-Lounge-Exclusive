import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { InventoryItemForm } from "@/components/admin/inventory-item-form";
import { ActionForm } from "@/components/action-form";
import { postStockMovement } from "@/server/actions/operations";
import { formatDateTime, formatNaira } from "@/lib/format";
import { Badge, Card, Field, inputClass, statusLabel } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Inventory Item" };
export const dynamic = "force-dynamic";

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffOrAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: items }, { data: categories }, { data: suppliers }, { data: units }, { data: movements }] =
    await Promise.all([
      supabase.from("inventory_items").select("*").eq("id", id).limit(1),
      supabase.from("inventory_categories").select("id, name").is("archived_at", null).order("display_order"),
      supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
      supabase.from("inventory_units").select("*").order("label"),
      supabase.from("inventory_movements").select("*, performer:profiles!inventory_movements_performed_by_fkey(full_name)")
        .eq("item_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
  const item = ((items ?? []) as Row[])[0];
  if (!item) notFound();
  const isAdmin = session.profile.role === "admin";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl text-ink">{item.name}</h1>
        <Badge tone="brand">{item.item_type}</Badge>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="font-display text-2xl font-bold text-brand-900">
              {Number(item.quantity_on_hand)}
            </p>
            <p className="text-xs font-semibold text-ink-soft">On hand ({item.unit})</p>
          </div>
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="font-display text-2xl font-bold text-brand-900">
              {Number(item.quantity_reserved)}
            </p>
            <p className="text-xs font-semibold text-ink-soft">Reserved</p>
          </div>
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="font-display text-2xl font-bold text-brand-900">
              {Number(item.quantity_available)}
            </p>
            <p className="text-xs font-semibold text-ink-soft">Available</p>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-ink-soft">
          Stock value: {formatNaira(Number(item.quantity_on_hand) * item.cost_price_kobo)} ·
          reorder at {Number(item.reorder_level)} {item.unit}
        </p>
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Post a stock movement</p>
        <ActionForm action={postStockMovement} submitLabel="Post movement">
          <input type="hidden" name="item_id" value={item.id} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Movement type" htmlFor="movement_type">
              <select id="movement_type" name="movement_type" className={inputClass} defaultValue="salon_usage">
                {["salon_usage", "retail_sale", "damage", "expired_stock", "theft_or_loss",
                  "manual_adjustment", "return_to_supplier", "customer_return", "supplier_purchase"]
                  .map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}
              </select>
            </Field>
            <Field label={`Quantity (${item.unit})`} htmlFor="quantity"
              hint="Outward types deduct automatically; manual adjustment uses the sign you enter.">
              <input id="quantity" name="quantity" type="number" step="0.001" required className={inputClass} />
            </Field>
            <Field label="Reason (required)" htmlFor="movement-reason">
              <input id="movement-reason" name="reason" required className={inputClass} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      {isAdmin && (
        <details className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <summary className="cursor-pointer font-semibold">Edit item details</summary>
          <div className="mt-4">
            <InventoryItemForm item={item} categories={categories ?? []}
              suppliers={suppliers ?? []} units={units ?? []} />
          </div>
        </details>
      )}

      <Card>
        <p className="font-semibold">Movement ledger (latest 30 — immutable)</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="py-1.5 font-medium">When</th>
                <th className="py-1.5 font-medium">Type</th>
                <th className="py-1.5 text-right font-medium">Qty</th>
                <th className="py-1.5 text-right font-medium">After</th>
                <th className="py-1.5 font-medium">Reason / by</th>
              </tr>
            </thead>
            <tbody>
              {((movements ?? []) as Row[]).map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink-soft">{formatDateTime(m.created_at)}</td>
                  <td className="py-2">{statusLabel(m.movement_type)}</td>
                  <td className={`py-2 text-right font-semibold ${Number(m.quantity) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)}
                  </td>
                  <td className="py-2 text-right">{Number(m.quantity_after)}</td>
                  <td className="py-2 text-ink-soft">
                    {m.reason ?? "—"}
                    {m.performer && ` · ${(m.performer as { full_name: string }).full_name}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
