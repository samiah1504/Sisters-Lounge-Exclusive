import { Field, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveSalon } from "@/server/actions/salons";
import type { Row } from "@/lib/db-rows";

export function SalonForm({ salon }: { salon: Row | null }) {
  return (
    <ActionForm
      action={saveSalon.bind(null, salon?.id ?? null)}
      submitLabel={salon ? "Save salon" : "Create salon"}
      warnUnsaved
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" hint='e.g. "Sisters Lounge Salon Abuja"'>
          <input id="name" name="name" required defaultValue={salon?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Chair capacity" htmlFor="chair_capacity"
          hint="Maximum members served at the same time.">
          <input id="chair_capacity" name="chair_capacity" type="number" min={1} max={50}
            defaultValue={salon?.chair_capacity ?? 3} className={inputClass} />
        </Field>
        <Field label="City" htmlFor="city">
          <input id="city" name="city" required defaultValue={salon?.city ?? ""} className={inputClass} />
        </Field>
        <Field label="State" htmlFor="state">
          <input id="state" name="state" required defaultValue={salon?.state ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Address" htmlFor="address">
        <input id="address" name="address" defaultValue={salon?.address ?? ""} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone">
          <input id="phone" name="phone" defaultValue={salon?.phone ?? ""} className={inputClass} />
        </Field>
        <Field label="WhatsApp" htmlFor="whatsapp">
          <input id="whatsapp" name="whatsapp" defaultValue={salon?.whatsapp ?? ""} className={inputClass} />
        </Field>
        <Field label="Latitude (optional)" htmlFor="latitude">
          <input id="latitude" name="latitude" type="number" step="any"
            defaultValue={salon?.latitude ?? ""} className={inputClass} />
        </Field>
        <Field label="Longitude (optional)" htmlFor="longitude">
          <input id="longitude" name="longitude" type="number" step="any"
            defaultValue={salon?.longitude ?? ""} className={inputClass} />
        </Field>
        <Field label="Launch date" htmlFor="launch_date"
          hint="Shown on the public page for coming-soon salons.">
          <input id="launch_date" name="launch_date" type="date"
            defaultValue={salon?.launch_date ?? ""} className={inputClass} />
        </Field>
        {!salon && (
          <Field label="Starting status" htmlFor="status"
            hint="Waitlist shows on the public page and collects signups. Open it later from its page.">
            <select id="status" name="status" defaultValue="waitlist" className={inputClass}>
              <option value="planned">Planned (internal only)</option>
              <option value="waitlist">Waitlist (public, collecting signups)</option>
            </select>
          </Field>
        )}
      </div>
    </ActionForm>
  );
}
