import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { InventoryItemForm } from "@/components/admin/inventory-item-form";
import { ActionForm } from "@/components/action-form";
import { addInventoryUnit } from "@/server/actions/operations";
import { Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Add Inventory Item" };
export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: categories }, { data: suppliers }, { data: units }] = await Promise.all([
    supabase.from("inventory_categories").select("id, name").is("archived_at", null).order("display_order"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("inventory_units").select("*").order("label"),
  ]);
  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Add Inventory Item</h1>
      <InventoryItemForm item={null} categories={categories ?? []}
        suppliers={suppliers ?? []} units={units ?? []} />
      <Card>
        <p className="mb-3 font-semibold">Need a new unit of measure?</p>
        <ActionForm action={addInventoryUnit} submitLabel="Add unit"
          className="flex flex-wrap items-end gap-3">
          <Field label="Unit name" htmlFor="unit-label">
            <input id="unit-label" name="label" placeholder="e.g. Carton" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
