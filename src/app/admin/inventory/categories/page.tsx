import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveInventoryCategory } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Inventory Categories" };
export const dynamic = "force-dynamic";

export default async function InventoryCategoriesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("*, items:inventory_items(id)")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Inventory Categories</h1>
      <div className="grid gap-3">
        {(categories ?? []).map((c) => (
          <Card key={c.id}>
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-semibold">
                  {c.name}
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {(c.items as Array<unknown>).length} item{(c.items as Array<unknown>).length !== 1 ? "s" : ""}
                  </span>
                </span>
                <Badge tone={c.is_active ? "green" : "gray"}>{c.is_active ? "Active" : "Hidden"}</Badge>
              </summary>
              <div className="mt-4">
                <ActionForm action={saveInventoryCategory.bind(null, c.id)} submitLabel="Save"
                  className="flex flex-wrap items-end gap-3">
                  <Field label="Name" htmlFor={`n-${c.id}`}>
                    <input id={`n-${c.id}`} name="name" defaultValue={c.name} className={inputClass} />
                  </Field>
                  <Field label="Order" htmlFor={`o-${c.id}`}>
                    <input id={`o-${c.id}`} name="display_order" type="number"
                      defaultValue={c.display_order} className={`${inputClass} w-24`} />
                  </Field>
                  <label className="flex items-center gap-2 pb-3 text-sm">
                    <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
                      defaultChecked={c.is_active} />
                    Active
                  </label>
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </div>
      <Card>
        <p className="mb-3 font-semibold">Create a category</p>
        <ActionForm action={saveInventoryCategory.bind(null, null)} submitLabel="Create"
          className="flex flex-wrap items-end gap-3">
          <Field label="Name" htmlFor="new-cat-name">
            <input id="new-cat-name" name="name" required className={inputClass} />
          </Field>
          <Field label="Order" htmlFor="new-cat-order">
            <input id="new-cat-order" name="display_order" type="number" defaultValue={99}
              className={`${inputClass} w-24`} />
          </Field>
          <input type="hidden" name="is_active" value="on" />
        </ActionForm>
      </Card>
    </div>
  );
}
