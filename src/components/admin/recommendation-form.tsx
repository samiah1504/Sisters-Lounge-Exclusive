import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveRecommendationRule } from "@/server/actions/admin";

export function RecommendationForm({
  rule,
  plans,
  extras,
  products,
  selected,
}: {
  rule: {
    id: string; name: string; context: string; badge_label: string | null;
    priority: number; is_active: boolean;
  } | null;
  plans: Array<{ id: string; name: string }>;
  extras: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  selected: {
    targetPlanId: string | null;
    extraIds: string[];
    productIds: string[];
  };
}) {
  return (
    <ActionForm
      action={saveRecommendationRule.bind(null, rule?.id ?? null)}
      submitLabel={rule ? "Save rule" : "Create rule"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rule name" htmlFor="name">
          <input id="name" name="name" required defaultValue={rule?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Context (where it appears)" htmlFor="context">
          <select id="context" name="context" defaultValue={rule?.context ?? "booking"} className={inputClass}>
            <option value="plan_detail">Plan detail page</option>
            <option value="booking">Appointment booking</option>
            <option value="booking_confirmation">Booking confirmation</option>
            <option value="upcoming_appointment">Upcoming appointment</option>
            <option value="post_appointment">Post appointment</option>
            <option value="product_catalogue">Product catalogue</option>
          </select>
        </Field>
        <Field label="Badge label (optional)" htmlFor="badge_label"
          hint='e.g. "Customers often add", "Recommended for this visit"'>
          <input id="badge_label" name="badge_label" maxLength={60}
            defaultValue={rule?.badge_label ?? ""} className={inputClass} />
        </Field>
        <Field label="Priority (higher wins)" htmlFor="priority">
          <input id="priority" name="priority" type="number" min={0} max={999}
            defaultValue={rule?.priority ?? 10} className={inputClass} />
        </Field>
        <Field label="Target plan (blank = every plan)" htmlFor="target_plan_id">
          <select id="target_plan_id" name="target_plan_id"
            defaultValue={selected.targetPlanId ?? ""} className={inputClass}>
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Recommend these extra services</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {extras.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="item_extra_ids" value={e.id} className="h-5 w-5 accent-brand-600"
                defaultChecked={selected.extraIds.includes(e.id)} />
              {e.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Recommend these products</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="item_product_ids" value={p.id} className="h-5 w-5 accent-brand-600"
                defaultChecked={selected.productIds.includes(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" className="h-5 w-5 accent-brand-600"
          defaultChecked={rule?.is_active ?? true} />
        Rule is active
      </label>
    </ActionForm>
  );
}
