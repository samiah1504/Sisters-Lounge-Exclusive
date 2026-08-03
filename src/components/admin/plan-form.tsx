import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { savePlan } from "@/server/actions/admin";
import type { Service, SubscriptionCategory, SubscriptionPlan } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PlanForm({
  plan,
  categories,
  services,
  includedServiceIds,
}: {
  plan: SubscriptionPlan | null;
  categories: SubscriptionCategory[];
  services: Service[];
  includedServiceIds: string[];
}) {
  return (
    <ActionForm action={savePlan.bind(null, plan?.id ?? null)} submitLabel={plan ? "Save plan" : "Create plan"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" htmlFor="name">
          <input id="name" name="name" required defaultValue={plan?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Plan code" htmlFor="plan_code" hint="Unique internal code, e.g. SL-AD-GOLD">
          <input id="plan_code" name="plan_code" required defaultValue={plan?.plan_code ?? ""} className={inputClass} />
        </Field>
        <Field label="Category" htmlFor="category_id">
          <select id="category_id" name="category_id" defaultValue={plan?.category_id ?? categories[0]?.id} className={inputClass}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tier label" htmlFor="tier_label" hint="e.g. Basic / Deluxe / Premium — free text">
          <input id="tier_label" name="tier_label" defaultValue={plan?.tier_label ?? ""} className={inputClass} />
        </Field>
        <Field label="Monthly price (₦)" htmlFor="monthly_price_naira">
          <input id="monthly_price_naira" name="monthly_price_naira" type="number" min={0} step="0.01" required
            defaultValue={plan ? plan.monthly_price_kobo / 100 : ""} className={inputClass} />
        </Field>
        <Field label="Visits included per cycle" htmlFor="visits_included">
          <input id="visits_included" name="visits_included" type="number" min={1} max={31} required
            defaultValue={plan?.visits_included ?? 2} className={inputClass} />
        </Field>
        <Field label="Minimum days between visits" htmlFor="min_visit_interval_days">
          <input id="min_visit_interval_days" name="min_visit_interval_days" type="number" min={0} max={30}
            defaultValue={plan?.min_visit_interval_days ?? 7} className={inputClass} />
        </Field>
        <Field label="Eligible age group" htmlFor="eligible_age_group">
          <select id="eligible_age_group" name="eligible_age_group" defaultValue={plan?.eligible_age_group ?? "all"} className={inputClass}>
            <option value="all">Everyone</option>
            <option value="adults">Adults</option>
            <option value="children">Children</option>
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status"
            defaultValue={plan && plan.status !== "archived" ? plan.status : "draft"} className={inputClass}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="closed">Closed to new members</option>
          </select>
        </Field>
        <Field label="Display order" htmlFor="display_order">
          <input id="display_order" name="display_order" type="number" min={0}
            defaultValue={plan?.display_order ?? 0} className={inputClass} />
        </Field>
        <Field label="Subscriber limit (blank = unlimited)" htmlFor="subscriber_limit">
          <input id="subscriber_limit" name="subscriber_limit" type="number" min={1}
            defaultValue={plan?.subscriber_limit ?? ""} className={inputClass} />
        </Field>
      </div>

      <Field label="Short description" htmlFor="short_description">
        <input id="short_description" name="short_description" maxLength={300}
          defaultValue={plan?.short_description ?? ""} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor="full_description">
        <textarea id="full_description" name="full_description" rows={3}
          defaultValue={plan?.full_description ?? ""} className={inputClass} />
      </Field>
      <Field label="Eligibility notes" htmlFor="eligibility_notes">
        <input id="eligibility_notes" name="eligibility_notes"
          defaultValue={plan?.eligibility_notes ?? ""} className={inputClass} />
      </Field>
      <Field label="Terms" htmlFor="terms">
        <textarea id="terms" name="terms" rows={2} defaultValue={plan?.terms ?? ""} className={inputClass} />
      </Field>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Available days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="available_days" value={i} className="h-5 w-5 accent-brand-600"
                defaultChecked={plan ? plan.available_days.includes(i) : true} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Included services</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="included_service_ids" value={s.id} className="h-5 w-5 accent-brand-600"
                defaultChecked={includedServiceIds.includes(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Leave all unchecked to allow every age/location-eligible service.
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_featured" className="h-5 w-5 accent-brand-600"
            defaultChecked={plan?.is_featured ?? false} />
          Featured (&quot;Most popular&quot;)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_public" className="h-5 w-5 accent-brand-600"
            defaultChecked={plan?.is_public ?? true} />
          Publicly visible
        </label>
      </div>
    </ActionForm>
  );
}
