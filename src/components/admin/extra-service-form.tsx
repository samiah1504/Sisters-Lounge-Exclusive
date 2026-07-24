import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveExtraService } from "@/server/actions/admin";
import type { ExtraService, SubscriptionCategory, SubscriptionPlan } from "@/lib/types";

export function ExtraServiceForm({
  extra,
  plans,
  categories,
  eligiblePlanIds,
  eligibleCategoryIds,
}: {
  extra: ExtraService | null;
  plans: SubscriptionPlan[];
  categories: SubscriptionCategory[];
  eligiblePlanIds: string[];
  eligibleCategoryIds: string[];
}) {
  return (
    <ActionForm
      action={saveExtraService.bind(null, extra?.id ?? null)}
      submitLabel={extra ? "Save add-on" : "Create add-on"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required defaultValue={extra?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Price (₦)" htmlFor="price_naira">
          <input id="price_naira" name="price_naira" type="number" min={0} step="0.01" required
            defaultValue={extra ? extra.price_kobo / 100 : ""} className={inputClass} />
        </Field>
        <Field label="Additional duration (minutes)" htmlFor="estimated_duration_minutes">
          <input id="estimated_duration_minutes" name="estimated_duration_minutes" type="number" min={5} max={480} required
            defaultValue={extra?.estimated_duration_minutes ?? 30} className={inputClass} />
        </Field>
        <Field label="Minimum advance notice (hours)" htmlFor="min_advance_notice_hours">
          <input id="min_advance_notice_hours" name="min_advance_notice_hours" type="number" min={0} max={336}
            defaultValue={extra?.min_advance_notice_hours ?? 0} className={inputClass} />
        </Field>
        <Field label="Payment requirement" htmlFor="payment_requirement">
          <select id="payment_requirement" name="payment_requirement"
            defaultValue={extra?.payment_requirement ?? "pay_at_salon"} className={inputClass}>
            <option value="pay_at_salon">Pay at salon</option>
            <option value="pay_before_confirmation">Pay before confirmation</option>
            <option value="admin_decides">Admin decides</option>
          </select>
        </Field>
        <Field label="Display order" htmlFor="display_order">
          <input id="display_order" name="display_order" type="number" min={0}
            defaultValue={extra?.display_order ?? 0} className={inputClass} />
        </Field>
      </div>
      <Field label="Short description" htmlFor="short_description">
        <input id="short_description" name="short_description" maxLength={300}
          defaultValue={extra?.short_description ?? ""} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor="description">
        <textarea id="description" name="description" rows={2}
          defaultValue={extra?.description ?? ""} className={inputClass} />
      </Field>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">
          Plan eligibility (none checked = all plans)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="eligible_plan_ids" value={p.id} className="h-5 w-5 accent-brand-600"
                defaultChecked={eligiblePlanIds.includes(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">
          Customer-category eligibility (none checked = all categories)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="eligible_category_ids" value={c.id} className="h-5 w-5 accent-brand-600"
                defaultChecked={eligibleCategoryIds.includes(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        {[
          ["salon_available", "Salon", extra?.salon_available ?? true],
          ["home_available", "Home service", extra?.home_available ?? false],
          ["is_active", "Active", extra?.is_active ?? true],
          ["is_public", "Public", extra?.is_public ?? true],
          ["is_featured", "Featured", extra?.is_featured ?? false],
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
