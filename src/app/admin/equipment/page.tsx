import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { addEquipmentLog, saveEquipment } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { Badge, Card, Field, inputClass, statusLabel } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Equipment" };
export const dynamic = "force-dynamic";

const CONDITION_TONE: Record<string, "green" | "amber" | "red" | "gray"> = {
  new: "green", good: "green", fair: "amber", needs_repair: "red",
  under_repair: "amber", damaged: "red", retired: "gray",
};

function EquipmentFields({ a, categories, suppliers, staff }: {
  a?: Row;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; full_name: string }>;
}) {
  const id = a?.id ?? "new";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor={`en-${id}`}>
          <input id={`en-${id}`} name="name" required defaultValue={a?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Asset code" htmlFor={`ec-${id}`}>
          <input id={`ec-${id}`} name="asset_code" required defaultValue={a?.asset_code ?? ""} className={inputClass} />
        </Field>
        <Field label="Category" htmlFor={`ecat-${id}`}>
          <select id={`ecat-${id}`} name="category_id" defaultValue={a?.category_id ?? ""} className={inputClass}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Purchase date" htmlFor={`epd-${id}`}>
          <input id={`epd-${id}`} name="purchase_date" type="date" defaultValue={a?.purchase_date ?? ""} className={inputClass} />
        </Field>
        <Field label="Purchase cost (₦)" htmlFor={`epc-${id}`}>
          <input id={`epc-${id}`} name="purchase_cost_naira" type="number" min={0} step="0.01"
            defaultValue={a ? a.purchase_cost_kobo / 100 : ""} className={inputClass} />
        </Field>
        <Field label="Supplier" htmlFor={`es-${id}`}>
          <select id={`es-${id}`} name="supplier_id" defaultValue={a?.supplier_id ?? ""} className={inputClass}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Condition" htmlFor={`econ-${id}`}>
          <select id={`econ-${id}`} name="condition" defaultValue={a?.condition ?? "good"} className={inputClass}>
            {Object.keys(CONDITION_TONE).map((c) => (
              <option key={c} value={c}>{statusLabel(c)}</option>
            ))}
          </select>
        </Field>
        <Field label="Location" htmlFor={`eloc-${id}`}>
          <input id={`eloc-${id}`} name="location" defaultValue={a?.location ?? "salon"} className={inputClass} />
        </Field>
        <Field label="Assigned staff" htmlFor={`east-${id}`}>
          <select id={`east-${id}`} name="assigned_staff_id" defaultValue={a?.assigned_staff_id ?? ""} className={inputClass}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
        <Field label="Warranty expiry" htmlFor={`ew-${id}`}>
          <input id={`ew-${id}`} name="warranty_expiry" type="date" defaultValue={a?.warranty_expiry ?? ""} className={inputClass} />
        </Field>
        <Field label="Maintenance interval (days)" htmlFor={`emi-${id}`}>
          <input id={`emi-${id}`} name="maintenance_interval_days" type="number" min={1}
            defaultValue={a?.maintenance_interval_days ?? ""} className={inputClass} />
        </Field>
        <Field label="Last maintenance" htmlFor={`elm-${id}`}>
          <input id={`elm-${id}`} name="last_maintenance_date" type="date"
            defaultValue={a?.last_maintenance_date ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`eno-${id}`}>
        <input id={`eno-${id}`} name="notes" defaultValue={a?.notes ?? ""} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
          defaultChecked={a?.is_active ?? true} />
        Active
      </label>
    </>
  );
}

export default async function EquipmentPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const [{ data: assets }, { data: categories }, { data: suppliers }, { data: staff }] =
    await Promise.all([
      supabase.from("equipment_assets")
        .select("*, logs:equipment_logs(log_type, description, cost_kobo, created_at)")
        .order("name"),
      supabase.from("inventory_categories").select("id, name").order("display_order"),
      supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name").in("role", ["staff", "admin"]).eq("is_active", true),
    ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Equipment Register</h1>
      <div className="grid gap-3">
        {((assets ?? []) as Row[]).map((a) => {
          const logs = (a.logs as Array<Row>).sort((x, y) => y.created_at.localeCompare(x.created_at));
          const maintenanceDue = a.next_maintenance_date && a.next_maintenance_date <= today;
          return (
            <Card key={a.id}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{a.name}</span>
                    <span className="ml-2 text-sm text-ink-soft">{a.asset_code}</span>
                    <span className="block text-sm text-ink-soft">
                      {formatNaira(a.purchase_cost_kobo)} ·
                      {a.next_maintenance_date
                        ? ` next maintenance ${formatDate(a.next_maintenance_date)}`
                        : " no maintenance schedule"}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {maintenanceDue && <Badge tone="amber">Maintenance due</Badge>}
                    <Badge tone={CONDITION_TONE[a.condition] ?? "gray"}>{statusLabel(a.condition)}</Badge>
                  </span>
                </summary>
                <div className="mt-4 grid gap-4">
                  <ActionForm action={saveEquipment.bind(null, a.id)} submitLabel="Save equipment">
                    <EquipmentFields a={a} categories={categories ?? []}
                      suppliers={suppliers ?? []} staff={staff ?? []} />
                  </ActionForm>
                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-sm font-semibold">Add maintenance / repair record</p>
                    <ActionForm action={addEquipmentLog.bind(null, a.id)} submitLabel="Add record"
                      className="flex flex-wrap items-end gap-3">
                      <Field label="Type" htmlFor={`lt-${a.id}`}>
                        <select id={`lt-${a.id}`} name="log_type" className={inputClass}>
                          <option value="maintenance">Maintenance</option>
                          <option value="repair">Repair</option>
                          <option value="note">Note</option>
                        </select>
                      </Field>
                      <Field label="Description" htmlFor={`ld-${a.id}`}>
                        <input id={`ld-${a.id}`} name="description" className={inputClass} />
                      </Field>
                      <Field label="Cost (₦)" htmlFor={`lc-${a.id}`}>
                        <input id={`lc-${a.id}`} name="cost_naira" type="number" min={0} step="0.01"
                          className={`${inputClass} w-32`} />
                      </Field>
                    </ActionForm>
                    {logs.length > 0 && (
                      <ul className="mt-3 grid gap-1 text-sm text-ink-soft">
                        {logs.slice(0, 6).map((l, i) => (
                          <li key={i}>
                            {formatDateTime(l.created_at)} · {statusLabel(l.log_type)} — {l.description}
                            {l.cost_kobo > 0 && ` (${formatNaira(l.cost_kobo)})`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </details>
            </Card>
          );
        })}
      </div>
      <Card>
        <p className="mb-3 font-semibold">Register new equipment</p>
        <ActionForm action={saveEquipment.bind(null, null)} submitLabel="Register equipment">
          <EquipmentFields categories={categories ?? []} suppliers={suppliers ?? []} staff={staff ?? []} />
        </ActionForm>
      </Card>
    </div>
  );
}
