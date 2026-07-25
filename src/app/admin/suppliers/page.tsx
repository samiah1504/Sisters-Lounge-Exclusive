import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveSupplier } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { formatNaira } from "@/lib/format";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

function SupplierFields({ s, bank }: { s?: Row; bank?: string }) {
  const id = s?.id ?? "new";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor={`sn-${id}`}>
          <input id={`sn-${id}`} name="name" required defaultValue={s?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Contact person" htmlFor={`sc-${id}`}>
          <input id={`sc-${id}`} name="contact_person" defaultValue={s?.contact_person ?? ""} className={inputClass} />
        </Field>
        <Field label="Phone" htmlFor={`sp-${id}`}>
          <input id={`sp-${id}`} name="phone" defaultValue={s?.phone ?? ""} className={inputClass} />
        </Field>
        <Field label="WhatsApp" htmlFor={`sw-${id}`}>
          <input id={`sw-${id}`} name="whatsapp_number" defaultValue={s?.whatsapp_number ?? ""} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor={`se-${id}`}>
          <input id={`se-${id}`} name="email" type="email" defaultValue={s?.email ?? ""} className={inputClass} />
        </Field>
        <Field label="City" htmlFor={`sci-${id}`}>
          <input id={`sci-${id}`} name="city" defaultValue={s?.city ?? ""} className={inputClass} />
        </Field>
        <Field label="State" htmlFor={`sst-${id}`}>
          <input id={`sst-${id}`} name="state" defaultValue={s?.state ?? ""} className={inputClass} />
        </Field>
        <Field label="Payment terms" htmlFor={`spt-${id}`}>
          <input id={`spt-${id}`} name="payment_terms" defaultValue={s?.payment_terms ?? ""}
            placeholder="e.g. 30 days credit" className={inputClass} />
        </Field>
        <Field label="Categories supplied" htmlFor={`scs-${id}`}>
          <input id={`scs-${id}`} name="categories_supplied" defaultValue={s?.categories_supplied ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Address" htmlFor={`sa-${id}`}>
        <input id={`sa-${id}`} name="address" defaultValue={s?.address ?? ""} className={inputClass} />
      </Field>
      <Field label="Bank details (admins only — stored separately)" htmlFor={`sb-${id}`}>
        <input id={`sb-${id}`} name="bank_details" defaultValue={bank ?? ""} className={inputClass} />
      </Field>
      <Field label="Notes" htmlFor={`sno-${id}`}>
        <input id={`sno-${id}`} name="notes" defaultValue={s?.notes ?? ""} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
          defaultChecked={s?.is_active ?? true} />
        Active
      </label>
    </>
  );
}

export default async function SuppliersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: suppliers }, { data: banks }] = await Promise.all([
    supabase.from("suppliers")
      .select("*, items:inventory_items(id), receipts:stock_receipts(id, status, payment_status, items:stock_receipt_items(quantity, unit_cost_kobo))")
      .order("name"),
    supabase.from("supplier_bank_details").select("*"),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Suppliers</h1>
      <div className="grid gap-3">
        {((suppliers ?? []) as Row[]).map((s) => {
          const receipts = s.receipts as Array<{
            status: string; payment_status: string;
            items: Array<{ quantity: number; unit_cost_kobo: number }>;
          }>;
          const confirmed = receipts.filter((r) => r.status === "received");
          const totalValue = confirmed.reduce(
            (t, r) => t + r.items.reduce((x, i) => x + i.quantity * i.unit_cost_kobo, 0), 0);
          const outstanding = confirmed.filter((r) => r.payment_status !== "paid").length;
          const bank = (banks ?? []).find((b) => b.supplier_id === s.id)?.bank_details;
          return (
            <Card key={s.id}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{s.name}</span>
                    <span className="block text-sm text-ink-soft">
                      {s.contact_person} · {s.phone} ·{" "}
                      {(s.items as Array<unknown>).length} item(s) supplied ·
                      purchases {formatNaira(totalValue)}
                      {outstanding > 0 && ` · ${outstanding} unpaid receipt(s)`}
                    </span>
                  </span>
                  <Badge tone={s.is_active ? "green" : "gray"}>
                    {s.is_active ? "Active" : "Archived"}
                  </Badge>
                </summary>
                <div className="mt-4">
                  <ActionForm action={saveSupplier.bind(null, s.id)} submitLabel="Save supplier">
                    <SupplierFields s={s} bank={bank} />
                  </ActionForm>
                </div>
              </details>
            </Card>
          );
        })}
      </div>
      <Card>
        <p className="mb-3 font-semibold">Add a supplier</p>
        <ActionForm action={saveSupplier.bind(null, null)} submitLabel="Add supplier">
          <SupplierFields />
        </ActionForm>
      </Card>
    </div>
  );
}
