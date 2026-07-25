import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveExpenseCategory, saveExpenseSettings } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Expense Categories" };
export const dynamic = "force-dynamic";

export default async function ExpenseCategoriesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: cats }, { data: settingsRows }] = await Promise.all([
    supabase.from("expense_categories").select("*").order("display_order"),
    supabase.from("expense_settings").select("*").limit(1),
  ]);
  const settings = (settingsRows?.[0] ?? null) as Row | null;

  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Expense Categories</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Categories keep spending reports meaningful. Deactivate instead of
          deleting so old expenses keep their history.
        </p>
      </div>

      {settings && (
        <Card>
          <p className="mb-3 font-semibold">Approval threshold</p>
          <ActionForm action={saveExpenseSettings} submitLabel="Save threshold">
            <Field
              label="Expenses above this amount (₦) need an admin approver"
              htmlFor="approval_threshold_naira"
            >
              <input id="approval_threshold_naira" name="approval_threshold_naira"
                type="number" min={0}
                defaultValue={Math.round((settings.approval_threshold_kobo ?? 0) / 100)}
                className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-3">
        {((cats ?? []) as Row[]).map((c) => (
          <Card key={c.id}>
            <details>
              <summary className="flex cursor-pointer items-center justify-between font-semibold">
                <span>{c.name}</span>
                <Badge tone={c.is_active ? "green" : "gray"}>
                  {c.is_active ? "Active" : "Inactive"}
                </Badge>
              </summary>
              <div className="mt-3">
                <ActionForm action={saveExpenseCategory.bind(null, c.id)} submitLabel="Save category">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name" htmlFor={`n-${c.id}`}>
                      <input id={`n-${c.id}`} name="name" defaultValue={c.name}
                        required className={inputClass} />
                    </Field>
                    <Field label="Display order" htmlFor={`o-${c.id}`}>
                      <input id={`o-${c.id}`} name="display_order" type="number" min={0}
                        defaultValue={c.display_order} className={inputClass} />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="is_active" defaultChecked={c.is_active}
                      className="h-5 w-5 accent-brand-600" />
                    Active — selectable on new expenses
                  </label>
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-3 font-semibold">New category</p>
        <ActionForm action={saveExpenseCategory.bind(null, null)} submitLabel="Create category">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="new-name">
              <input id="new-name" name="name" required className={inputClass} />
            </Field>
            <Field label="Display order" htmlFor="new-order">
              <input id="new-order" name="display_order" type="number" min={0}
                defaultValue={99} className={inputClass} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked className="h-5 w-5 accent-brand-600" />
            Active — selectable on new expenses
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
