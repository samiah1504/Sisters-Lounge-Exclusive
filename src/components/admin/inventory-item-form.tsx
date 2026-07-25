import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveInventoryItem } from "@/server/actions/operations";
import type { Row } from "@/lib/db-rows";

export function InventoryItemForm({
  item,
  categories,
  suppliers,
  units,
}: {
  item: Row | null;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  units: Array<{ code: string; label: string }>;
}) {
  return (
    <ActionForm action={saveInventoryItem.bind(null, item?.id ?? null)}
      submitLabel={item ? "Save item" : "Create item"} warnUnsaved>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required defaultValue={item?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="SKU" htmlFor="sku">
          <input id="sku" name="sku" required defaultValue={item?.sku ?? ""} className={inputClass} />
        </Field>
        <Field label="Barcode (optional)" htmlFor="barcode">
          <input id="barcode" name="barcode" defaultValue={item?.barcode ?? ""} className={inputClass} />
        </Field>
        <Field label="Type" htmlFor="item_type">
          <select id="item_type" name="item_type" defaultValue={item?.item_type ?? "consumable"} className={inputClass}>
            <option value="consumable">Salon consumable</option>
            <option value="retail">Retail product</option>
            <option value="equipment">Tool / equipment</option>
          </select>
        </Field>
        <Field label="Category" htmlFor="category_id">
          <select id="category_id" name="category_id" defaultValue={item?.category_id ?? ""} className={inputClass}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Unit of measure" htmlFor="unit">
          <select id="unit" name="unit" defaultValue={item?.unit ?? "piece"} className={inputClass}>
            {units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </Field>
        <Field label="Reorder level" htmlFor="reorder_level"
          hint="Alert when available stock reaches this.">
          <input id="reorder_level" name="reorder_level" type="number" min={0} step="0.001"
            defaultValue={item?.reorder_level ?? 0} className={inputClass} />
        </Field>
        <Field label="Preferred reorder quantity" htmlFor="reorder_quantity">
          <input id="reorder_quantity" name="reorder_quantity" type="number" min={0} step="0.001"
            defaultValue={item?.reorder_quantity ?? 0} className={inputClass} />
        </Field>
        <Field label="Cost price (₦ per unit)" htmlFor="cost_price_naira">
          <input id="cost_price_naira" name="cost_price_naira" type="number" min={0} step="0.01"
            defaultValue={item ? item.cost_price_kobo / 100 : 0} className={inputClass} />
        </Field>
        <Field label="Selling price (₦, retail only)" htmlFor="selling_price_naira">
          <input id="selling_price_naira" name="selling_price_naira" type="number" min={0} step="0.01"
            defaultValue={item?.selling_price_kobo != null ? item.selling_price_kobo / 100 : ""}
            className={inputClass} />
        </Field>
        <Field label="Supplier" htmlFor="supplier_id">
          <select id="supplier_id" name="supplier_id" defaultValue={item?.supplier_id ?? ""} className={inputClass}>
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Storage location" htmlFor="storage_location">
          <input id="storage_location" name="storage_location"
            defaultValue={item?.storage_location ?? ""} className={inputClass} />
        </Field>
        <Field label="Expiry date (optional)" htmlFor="expiry_date">
          <input id="expiry_date" name="expiry_date" type="date"
            defaultValue={item?.expiry_date ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <textarea id="description" name="description" rows={2}
          defaultValue={item?.description ?? ""} className={inputClass} />
      </Field>
      <Field label="Notes" htmlFor="inv-notes">
        <textarea id="inv-notes" name="notes" rows={2}
          defaultValue={item?.notes ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-4">
        {[["is_active", "Active", item?.is_active ?? true],
          ["salon_use_available", "Available for salon use", item?.salon_use_available ?? true],
          ["retail_available", "Available for retail", item?.retail_available ?? false],
        ].map(([name, label, checked]) => (
          <label key={name as string} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name as string} className="h-5 w-5 accent-brand-600"
              defaultChecked={checked as boolean} />
            {label}
          </label>
        ))}
      </div>
    </ActionForm>
  );
}
