import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import {
  cancelStockReceipt,
  confirmStockReceipt,
  createStockReceipt,
} from "@/server/actions/operations";
import { ActionButton, ActionForm } from "@/components/action-form";
import { formatDate, formatNaira } from "@/lib/format";
import { Badge, Card, EmptyState, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Stock Receiving" };
export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "amber", received: "green", partially_received: "amber", cancelled: "gray" } as const;

export default async function ReceivingPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const [{ data: receipts }, { data: items }, { data: suppliers }] = await Promise.all([
    supabase.from("stock_receipts")
      .select("*, supplier:suppliers(name), items:stock_receipt_items(quantity, unit_cost_kobo, item:inventory_items(name, unit))")
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("inventory_items").select("id, name, unit").is("archived_at", null)
      .neq("item_type", "equipment").order("name"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Stock Receiving</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Record deliveries as a draft, then confirm to update stock. Confirming
          twice never doubles quantities.
        </p>
      </div>

      <Card>
        <p className="mb-3 font-semibold">New stock receipt</p>
        <ActionForm action={createStockReceipt} submitLabel="Create draft receipt">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier" htmlFor="rcpt-supplier">
              <select id="rcpt-supplier" name="supplier_id" className={inputClass} defaultValue="">
                <option value="">No supplier</option>
                {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Invoice number" htmlFor="rcpt-invoice">
              <input id="rcpt-invoice" name="invoice_number" className={inputClass} />
            </Field>
            <Field label="Payment status" htmlFor="rcpt-pay">
              <select id="rcpt-pay" name="payment_status" className={inputClass} defaultValue="unpaid">
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
              </select>
            </Field>
          </div>
          <p className="text-sm font-semibold text-ink-soft">Items received</p>
          <div className="grid gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_110px] gap-2">
                <select name="item_id" className={inputClass} defaultValue="">
                  <option value="">— item —</option>
                  {(items ?? []).map((it) => (
                    <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                  ))}
                </select>
                <input name="qty" type="number" step="0.001" min={0} placeholder="Qty" className={inputClass} />
                <input name="unit_cost" type="number" step="0.01" min={0} placeholder="₦/unit" className={inputClass} />
              </div>
            ))}
          </div>
          <Field label="Notes" htmlFor="rcpt-notes">
            <input id="rcpt-notes" name="notes" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      {(receipts ?? []).length === 0 ? (
        <EmptyState title="No receipts yet" message="Recorded deliveries appear here." />
      ) : (
        <div className="grid gap-2.5">
          {((receipts ?? []) as Row[]).map((r) => {
            const lines = r.items as Array<{ quantity: number; unit_cost_kobo: number; item: { name: string; unit: string } }>;
            const total = lines.reduce((t, l) => t + l.quantity * l.unit_cost_kobo, 0);
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {(r.supplier as { name: string })?.name ?? "No supplier"}
                      {r.invoice_number && <span className="text-ink-soft"> · {r.invoice_number}</span>}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {formatDate(r.receipt_date)} · {lines.length} line(s) · total {formatNaira(total)} · {r.payment_status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{r.status}</Badge>
                </div>
                <ul className="mt-2 grid gap-1 text-sm text-ink-soft">
                  {lines.map((l, i) => (
                    <li key={i}>
                      {l.item.name}: {Number(l.quantity)} {l.item.unit} @ {formatNaira(l.unit_cost_kobo)}
                    </li>
                  ))}
                </ul>
                {r.status === "draft" && (
                  <div className="mt-3 flex gap-2">
                    <ActionButton action={confirmStockReceipt.bind(null, r.id)}
                      label="Confirm — update stock" variant="primary" />
                    <ActionButton action={cancelStockReceipt.bind(null, r.id)}
                      label="Cancel" variant="danger"
                      confirm="Cancel this draft receipt? Stock will not be changed." />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
