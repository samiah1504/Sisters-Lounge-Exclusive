import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveProduct } from "@/server/actions/admin";
import type { Product } from "@/lib/types";

export function ProductForm({
  product,
  categories,
  inventoryItems = [],
}: {
  product: Product | null;
  categories: Array<{ id: string; name: string }>;
  inventoryItems?: Array<{ id: string; name: string; sku: string }>;
}) {
  return (
    <ActionForm
      action={saveProduct.bind(null, product?.id ?? null)}
      submitLabel={product ? "Save product" : "Create product"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required defaultValue={product?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="SKU" htmlFor="sku">
          <input id="sku" name="sku" required defaultValue={product?.sku ?? ""} className={inputClass} />
        </Field>
        <Field label="Category" htmlFor="category_id">
          <select id="category_id" name="category_id" defaultValue={product?.category_id ?? ""} className={inputClass}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Stock status" htmlFor="stock_status"
          hint={product?.inventory_item_id ? "Managed automatically by the linked inventory item." : undefined}>
          <select id="stock_status" name="stock_status" defaultValue={product?.stock_status ?? "in_stock"} className={inputClass}>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </Field>
        <Field label="Linked inventory item" htmlFor="inventory_item_id"
          hint="When linked, availability follows real stock levels.">
          <select id="inventory_item_id" name="inventory_item_id"
            defaultValue={product?.inventory_item_id ?? ""} className={inputClass}>
            <option value="">Not linked</option>
            {inventoryItems.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
            ))}
          </select>
        </Field>
        <Field label="Selling price (₦)" htmlFor="price_naira">
          <input id="price_naira" name="price_naira" type="number" min={0} step="0.01" required
            defaultValue={product ? product.price_kobo / 100 : ""} className={inputClass} />
        </Field>
        <Field label="Subscriber price (₦, optional)" htmlFor="subscriber_price_naira">
          <input id="subscriber_price_naira" name="subscriber_price_naira" type="number" min={0} step="0.01"
            defaultValue={product?.subscriber_price_kobo != null ? product.subscriber_price_kobo / 100 : ""}
            className={inputClass} />
        </Field>
        <Field label="Age suitability" htmlFor="age_suitability">
          <select id="age_suitability" name="age_suitability" defaultValue={product?.age_suitability ?? "all"} className={inputClass}>
            <option value="all">Everyone</option>
            <option value="adults">Adults</option>
            <option value="children">Children</option>
          </select>
        </Field>
        <Field label="Hair-type suitability" htmlFor="hair_type_suitability">
          <input id="hair_type_suitability" name="hair_type_suitability"
            defaultValue={product?.hair_type_suitability ?? ""} className={inputClass}
            placeholder="e.g. 4a-4c, low porosity" />
        </Field>
        <Field label="Display order" htmlFor="display_order">
          <input id="display_order" name="display_order" type="number" min={0}
            defaultValue={product?.display_order ?? 0} className={inputClass} />
        </Field>
      </div>
      <Field label="Short description" htmlFor="short_description">
        <input id="short_description" name="short_description" maxLength={300}
          defaultValue={product?.short_description ?? ""} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor="full_description">
        <textarea id="full_description" name="full_description" rows={3}
          defaultValue={product?.full_description ?? ""} className={inputClass} />
      </Field>
      <Field label="Usage instructions" htmlFor="usage_instructions">
        <textarea id="usage_instructions" name="usage_instructions" rows={2}
          defaultValue={product?.usage_instructions ?? ""} className={inputClass} />
      </Field>
      <Field label="Ingredients" htmlFor="ingredients">
        <textarea id="ingredients" name="ingredients" rows={2}
          defaultValue={product?.ingredients ?? ""} className={inputClass} />
      </Field>
      <Field label="Warnings" htmlFor="warnings">
        <input id="warnings" name="warnings" defaultValue={product?.warnings ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
            defaultChecked={product?.is_active ?? true} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_featured" className="h-5 w-5 accent-brand-600"
            defaultChecked={product?.is_featured ?? false} />
          Featured
        </label>
      </div>
    </ActionForm>
  );
}
