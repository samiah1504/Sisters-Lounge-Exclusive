import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { archiveCategory, saveCategory } from "@/server/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

function CategoryFields({ c }: { c?: Record<string, unknown> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`name-${c?.id ?? "new"}`}>
          <input id={`name-${c?.id ?? "new"}`} name="name" required
            defaultValue={(c?.name as string) ?? ""} className={inputClass} />
        </Field>
        <Field label="Service location" htmlFor={`loc-${c?.id ?? "new"}`}>
          <select id={`loc-${c?.id ?? "new"}`} name="service_location_type"
            defaultValue={(c?.service_location_type as string) ?? "salon"} className={inputClass}>
            <option value="salon">Salon</option>
            <option value="home">Home</option>
            <option value="both">Both</option>
          </select>
        </Field>
      </div>
      <Field label="Short description" htmlFor={`sd-${c?.id ?? "new"}`}>
        <input id={`sd-${c?.id ?? "new"}`} name="short_description"
          defaultValue={(c?.short_description as string) ?? ""} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor={`fd-${c?.id ?? "new"}`}>
        <textarea id={`fd-${c?.id ?? "new"}`} name="full_description" rows={2}
          defaultValue={(c?.full_description as string) ?? ""} className={inputClass} />
      </Field>
      <Field label="Eligibility notes" htmlFor={`en-${c?.id ?? "new"}`}>
        <input id={`en-${c?.id ?? "new"}`} name="eligibility_notes"
          defaultValue={(c?.eligibility_notes as string) ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Display order" htmlFor={`do-${c?.id ?? "new"}`}>
          <input id={`do-${c?.id ?? "new"}`} name="display_order" type="number" min={0}
            defaultValue={(c?.display_order as number) ?? 0} className={`${inputClass} w-28`} />
        </Field>
        <label className="flex items-center gap-2 pb-3 text-sm">
          <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
            defaultChecked={(c?.is_active as boolean) ?? true} />
          Active
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm">
          <input type="checkbox" name="is_public" className="h-5 w-5 accent-brand-600"
            defaultChecked={(c?.is_public as boolean) ?? true} />
          Public
        </label>
      </div>
    </>
  );
}

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("subscription_categories")
    .select("*, plans:subscription_plans(id)")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Subscription Categories</h1>

      <div className="grid gap-3">
        {(categories ?? []).map((c) => (
          <Card key={c.id}>
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-semibold">
                  {c.name}
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {(c.plans as Array<unknown>).length} plan
                    {(c.plans as Array<unknown>).length !== 1 ? "s" : ""}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {c.archived_at ? (
                    <Badge tone="gray">Archived</Badge>
                  ) : c.is_active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="amber">Hidden</Badge>
                  )}
                </span>
              </summary>
              <div className="mt-4 grid gap-4">
                <ActionForm action={saveCategory.bind(null, c.id)} submitLabel="Save category">
                  <CategoryFields c={c} />
                </ActionForm>
                <form action={archiveCategory.bind(null, c.id, !c.archived_at)}>
                  <button className="text-sm font-semibold text-red-700 hover:underline">
                    {c.archived_at ? "Restore category" : "Archive category"}
                  </button>
                </form>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-3 font-semibold">Create a new category</p>
        <ActionForm action={saveCategory.bind(null, null)} submitLabel="Create category">
          <CategoryFields />
        </ActionForm>
      </Card>
    </div>
  );
}
