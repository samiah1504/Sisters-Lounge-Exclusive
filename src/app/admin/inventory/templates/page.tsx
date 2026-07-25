import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import {
  deleteConsumptionTemplate,
  saveConsumptionTemplate,
} from "@/server/actions/operations";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Usage Templates" };
export const dynamic = "force-dynamic";

export default async function ConsumptionTemplatesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: templates }, { data: services }, { data: extras }, { data: items }] =
    await Promise.all([
      supabase.from("service_consumption_templates")
        .select("*, service:services(name), extra:extra_services(name), item:inventory_items(name, unit)")
        .eq("is_active", true).order("created_at"),
      supabase.from("services").select("id, name").is("archived_at", null).order("name"),
      supabase.from("extra_services").select("id, name").is("archived_at", null).order("name"),
      supabase.from("inventory_items").select("id, name, unit").is("archived_at", null)
        .neq("item_type", "equipment").order("name"),
    ]);

  const grouped = new Map<string, Row[]>();
  for (const t of (templates ?? []) as Row[]) {
    const key = (t.service as { name: string })?.name ??
      `${(t.extra as { name: string })?.name} (extra)`;
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Service Usage Templates
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Standard consumables per service. These prefill the usage form when
          an appointment is completed — nothing is deducted automatically.
        </p>
      </div>

      <Card>
        <p className="mb-3 font-semibold">Add a template line</p>
        <ActionForm action={saveConsumptionTemplate} submitLabel="Add line"
          className="flex flex-wrap items-end gap-3">
          <Field label="Service" htmlFor="tpl-service">
            <select id="tpl-service" name="service_ref" className={inputClass} defaultValue="">
              <option value="">— choose —</option>
              <optgroup label="Included services">
                {(services ?? []).map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>{s.name}</option>
                ))}
              </optgroup>
              <optgroup label="Extra services">
                {(extras ?? []).map((e) => (
                  <option key={e.id} value={`extra:${e.id}`}>{e.name}</option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label="Inventory item" htmlFor="tpl-item">
            <select id="tpl-item" name="item_id" className={inputClass} defaultValue="">
              <option value="">— choose —</option>
              {(items ?? []).map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </Field>
          <Field label="Standard quantity" htmlFor="tpl-qty">
            <input id="tpl-qty" name="standard_quantity" type="number" step="0.001" min={0}
              className={`${inputClass} w-32`} />
          </Field>
          <label className="flex items-center gap-2 pb-3 text-sm">
            <input type="checkbox" name="is_required" defaultChecked className="h-5 w-5 accent-brand-600" />
            Required
          </label>
        </ActionForm>
      </Card>

      {[...grouped.entries()].map(([name, lines]) => (
        <Card key={name}>
          <p className="font-semibold">{name}</p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {lines.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>
                  {(t.item as { name: string }).name}: {Number(t.standard_quantity)} {t.unit}
                  {!t.is_required && <span className="text-ink-soft"> (optional)</span>}
                </span>
                <ActionButton action={deleteConsumptionTemplate.bind(null, t.id)}
                  label="Remove" variant="danger" confirm="Remove this template line?" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
