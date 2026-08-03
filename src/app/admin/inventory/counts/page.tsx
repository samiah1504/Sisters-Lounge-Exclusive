import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDefaultSalonId, getStockTotals } from "@/server/stock";
import { requireStaffOrAdmin } from "@/server/auth";
import { createStockCount, reviewStockCount } from "@/server/actions/operations";
import { ActionButton, ActionForm } from "@/components/action-form";
import { formatDateTime, formatNaira } from "@/lib/format";
import { Badge, Card, EmptyState, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Stock Counts" };
export const dynamic = "force-dynamic";

const TONE = { draft: "gray", in_progress: "amber", submitted: "amber", approved: "green", rejected: "red", posted: "green" } as const;

export default async function StockCountsPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const salonId = await getDefaultSalonId(supabase);
  const [{ data: counts }, { data: rawItems }, totals] = await Promise.all([
    supabase.from("stock_counts")
      .select("*, starter:profiles!stock_counts_started_by_fkey(full_name), items:stock_count_items(system_quantity, counted_quantity, variance, reason, item:inventory_items(name, unit, cost_price_kobo))")
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("inventory_items").select("id, name, unit")
      .is("archived_at", null).neq("item_type", "equipment").order("name"),
    getStockTotals(supabase, salonId ?? undefined),
  ]);
  const items = (rawItems ?? []).map((it) => ({
    ...it,
    quantity_on_hand: totals.get(it.id)?.on_hand ?? 0,
  }));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Stock Counts</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Enter what you physically counted — the variance against the system is
          computed automatically and posts to stock only after approval.
        </p>
      </div>

      <Card>
        <p className="mb-3 font-semibold">New stock count</p>
        <ActionForm action={createStockCount} submitLabel="Submit count for approval">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" htmlFor="count-location">
              <input id="count-location" name="location" defaultValue="salon" className={inputClass} />
            </Field>
            <Field label="Notes" htmlFor="count-notes">
              <input id="count-notes" name="notes" className={inputClass} />
            </Field>
          </div>
          <p className="text-sm font-semibold text-ink-soft">
            Counted quantities (leave blank to skip an item)
          </p>
          <div className="grid gap-2">
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_110px_1fr] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-medium">{it.name}</span>
                  <span className="block text-xs text-ink-soft">
                    system: {Number(it.quantity_on_hand)} {it.unit}
                  </span>
                </span>
                <input type="hidden" name="item_id" value={it.id} />
                <input name="counted" type="number" step="0.001" min={0}
                  placeholder="counted" className={inputClass} />
                <input name="count_reason" placeholder="reason if different"
                  className={inputClass} />
              </div>
            ))}
          </div>
        </ActionForm>
      </Card>

      {(counts ?? []).length === 0 ? (
        <EmptyState title="No counts yet" message="Submitted counts await approval here." />
      ) : (
        <div className="grid gap-2.5">
          {((counts ?? []) as Row[]).map((c) => {
            const lines = c.items as Array<{
              system_quantity: number; counted_quantity: number; variance: number;
              reason: string; item: { name: string; unit: string; cost_price_kobo: number };
            }>;
            const varianceValue = lines.reduce(
              (t, l) => t + Math.abs(Number(l.variance)) * l.item.cost_price_kobo, 0);
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {c.location} · {(c.starter as { full_name: string })?.full_name ?? "—"}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {formatDateTime(c.created_at)} · variance value {formatNaira(varianceValue)}
                    </p>
                  </div>
                  <Badge tone={TONE[c.status as keyof typeof TONE]}>{c.status}</Badge>
                </div>
                <ul className="mt-2 grid gap-1 text-sm">
                  {lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{l.item.name}: {Number(l.system_quantity)} → {Number(l.counted_quantity)} {l.item.unit}
                        {l.reason && <span className="text-ink-soft"> — {l.reason}</span>}
                      </span>
                      <span className={Number(l.variance) === 0 ? "text-ink-soft" : Number(l.variance) < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                        {Number(l.variance) > 0 ? "+" : ""}{Number(l.variance)}
                      </span>
                    </li>
                  ))}
                </ul>
                {c.status === "submitted" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      action={reviewStockCount.bind(null, c.id, true, "approved after review")}
                      label="Approve — post adjustments" variant="primary"
                      confirm="Approve this count? Stock adjustments will be posted to the ledger." />
                    <ActionButton
                      action={reviewStockCount.bind(null, c.id, false, "rejected")}
                      label="Reject" variant="danger" />
                  </div>
                )}
                {c.rejected_reason && (
                  <p className="mt-2 text-sm text-red-700">Rejected: {c.rejected_reason}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
