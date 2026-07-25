import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveRecurringTemplate } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { formatDate, formatNaira } from "@/lib/format";
import { Badge, Card, Field, inputClass, statusLabel } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Recurring Expenses" };
export const dynamic = "force-dynamic";

function TemplateFields({ t, categories }: {
  t?: Row; categories: Array<{ id: string; name: string }>;
}) {
  const id = t?.id ?? "new";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Category" htmlFor={`rc-${id}`}>
        <select id={`rc-${id}`} name="category_id" defaultValue={t?.category_id ?? ""} className={inputClass}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Description" htmlFor={`rd-${id}`}>
        <input id={`rd-${id}`} name="description" required defaultValue={t?.description ?? ""} className={inputClass} />
      </Field>
      <Field label="Amount (₦)" htmlFor={`ra-${id}`}>
        <input id={`ra-${id}`} name="amount_naira" type="number" min={0} step="0.01" required
          defaultValue={t ? t.amount_kobo / 100 : ""} className={inputClass} />
      </Field>
      <Field label="Frequency" htmlFor={`rf-${id}`}>
        <select id={`rf-${id}`} name="frequency" defaultValue={t?.frequency ?? "monthly"} className={inputClass}>
          {["weekly", "monthly", "quarterly", "yearly"].map((f) => (
            <option key={f} value={f}>{statusLabel(f)}</option>
          ))}
        </select>
      </Field>
      <Field label="Start date" htmlFor={`rs-${id}`}>
        <input id={`rs-${id}`} name="start_date" type="date"
          defaultValue={t?.start_date ?? today} className={inputClass} />
      </Field>
      <Field label="Next due date" htmlFor={`rn-${id}`}>
        <input id={`rn-${id}`} name="next_due_date" type="date"
          defaultValue={t?.next_due_date ?? today} className={inputClass} />
      </Field>
      <Field label="Vendor" htmlFor={`rv-${id}`}>
        <input id={`rv-${id}`} name="vendor" defaultValue={t?.vendor ?? ""} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 pt-6 text-sm">
        <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
          defaultChecked={t?.is_active ?? true} />
        Active
      </label>
    </div>
  );
}

export default async function RecurringExpensesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: templates }, { data: categories }] = await Promise.all([
    supabase.from("recurring_expense_templates")
      .select("*, category:expense_categories(name)").order("next_due_date"),
    supabase.from("expense_categories").select("id, name").eq("is_active", true).order("display_order"),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Recurring Expenses</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Templates create DRAFT expenses when due — nothing is ever paid
          automatically. Schedule the daily generator alongside your existing
          cron: <code>select fn_generate_recurring_expenses();</code>
        </p>
      </div>

      <div className="grid gap-3">
        {((templates ?? []) as Row[]).map((t) => (
          <Card key={t.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{t.description}</span>
                  <span className="block text-sm text-ink-soft">
                    {formatNaira(t.amount_kobo)} · {t.frequency} ·
                    next due {formatDate(t.next_due_date)}
                    {t.vendor && ` · ${t.vendor}`}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {t.next_due_date <= today && t.is_active && <Badge tone="amber">Due</Badge>}
                  <Badge tone={t.is_active ? "green" : "gray"}>{t.is_active ? "Active" : "Off"}</Badge>
                </span>
              </summary>
              <div className="mt-4">
                <ActionForm action={saveRecurringTemplate.bind(null, t.id)} submitLabel="Save template">
                  <TemplateFields t={t} categories={categories ?? []} />
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-3 font-semibold">New recurring template</p>
        <ActionForm action={saveRecurringTemplate.bind(null, null)} submitLabel="Create template">
          <TemplateFields categories={categories ?? []} />
        </ActionForm>
      </Card>
    </div>
  );
}
