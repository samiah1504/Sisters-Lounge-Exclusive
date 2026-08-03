import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { archiveService, saveService } from "@/server/actions/admin";
import { ActionForm } from "@/components/action-form";
import { formatDuration } from "@/lib/format";
import { Badge, Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Services" };
export const dynamic = "force-dynamic";

function ServiceFields({ s }: { s?: Record<string, unknown> }) {
  const id = (s?.id as string) ?? "new";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`name-${id}`}>
          <input id={`name-${id}`} name="name" required
            defaultValue={(s?.name as string) ?? ""} className={inputClass} />
        </Field>
        <Field label="Category" htmlFor={`cat-${id}`}>
          <input id={`cat-${id}`} name="category"
            defaultValue={(s?.category as string) ?? "general"} className={inputClass} />
        </Field>
        <Field label="Estimated duration (minutes)" htmlFor={`dur-${id}`}>
          <input id={`dur-${id}`} name="estimated_duration_minutes" type="number" min={5} max={600} required
            defaultValue={(s?.estimated_duration_minutes as number) ?? 60} className={inputClass} />
        </Field>
        <Field label="Eligible age group" htmlFor={`age-${id}`}>
          <select id={`age-${id}`} name="eligible_age_group"
            defaultValue={(s?.eligible_age_group as string) ?? "all"} className={inputClass}>
            <option value="all">Everyone</option>
            <option value="adults">Adults</option>
            <option value="children">Children</option>
          </select>
        </Field>
        <Field label="Required staff skill (optional)" htmlFor={`skill-${id}`}>
          <input id={`skill-${id}`} name="required_skill"
            defaultValue={(s?.required_skill as string) ?? ""} className={inputClass} />
        </Field>
        <Field label="Display order" htmlFor={`do-${id}`}>
          <input id={`do-${id}`} name="display_order" type="number" min={0}
            defaultValue={(s?.display_order as number) ?? 0} className={inputClass} />
        </Field>
      </div>
      <Field label="Description" htmlFor={`desc-${id}`}>
        <textarea id={`desc-${id}`} name="description" rows={2}
          defaultValue={(s?.description as string) ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
            defaultChecked={(s?.is_active as boolean) ?? true} />
          Active
        </label>
      </div>
    </>
  );
}

export default async function AdminServicesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Core Services</h1>
      <p className="text-sm text-ink-soft">
        Services included in subscriptions. Associate them with plans from the
        plan editor.
      </p>

      <div className="grid gap-3">
        {(services ?? []).map((s) => (
          <Card key={s.id}>
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-semibold">
                  {s.name}
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {formatDuration(s.estimated_duration_minutes)} · {s.eligible_age_group}
                  </span>
                </span>
                {s.archived_at ? (
                  <Badge tone="gray">Archived</Badge>
                ) : s.is_active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="amber">Hidden</Badge>
                )}
              </summary>
              <div className="mt-4 grid gap-4">
                <ActionForm action={saveService.bind(null, s.id)} submitLabel="Save service">
                  <ServiceFields s={s} />
                </ActionForm>
                <form action={archiveService.bind(null, s.id, !s.archived_at)}>
                  <button className="text-sm font-semibold text-red-700 hover:underline">
                    {s.archived_at ? "Restore service" : "Archive service"}
                  </button>
                </form>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-3 font-semibold">Create a new service</p>
        <ActionForm action={saveService.bind(null, null)} submitLabel="Create service">
          <ServiceFields />
        </ActionForm>
      </Card>
    </div>
  );
}
