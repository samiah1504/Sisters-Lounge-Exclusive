"use client";

import { useActionState } from "react";
import { updateProfile, type ActionState } from "@/server/actions/customer";
import { Field, buttonClass, inputClass } from "@/components/ui";
import type { CustomerProfile, Profile } from "@/lib/types";

export function ProfileForm({
  profile,
  customerProfile,
  serviceAreas,
}: {
  profile: Profile;
  customerProfile: CustomerProfile;
  serviceAreas: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateProfile,
    {},
  );
  const prefs = customerProfile.notification_preferences ?? {};

  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name" htmlFor="full_name">
        <input id="full_name" name="full_name" required minLength={2}
          defaultValue={profile.full_name} className={inputClass} autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="email" hint="Email changes are handled from account security (coming with payments phase).">
        <input id="email" value={profile.email ?? ""} disabled className={`${inputClass} bg-brand-50 text-ink-soft`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" htmlFor="phone">
          <input id="phone" name="phone" type="tel" required
            defaultValue={profile.phone ?? ""} className={inputClass} autoComplete="tel" />
        </Field>
        <Field label="WhatsApp number" htmlFor="whatsapp_number">
          <input id="whatsapp_number" name="whatsapp_number" type="tel" required
            defaultValue={customerProfile.whatsapp_number ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Address" htmlFor="address">
        <input id="address" name="address" required
          defaultValue={customerProfile.address ?? ""} className={inputClass} autoComplete="street-address" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <input id="city" name="city" required
            defaultValue={customerProfile.city ?? ""} className={inputClass} />
        </Field>
        <Field label="State" htmlFor="state">
          <input id="state" name="state" required
            defaultValue={customerProfile.state ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Preferred contact method" htmlFor="preferred_contact_method">
        <select id="preferred_contact_method" name="preferred_contact_method"
          defaultValue={customerProfile.preferred_contact_method} className={inputClass}>
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Phone call</option>
          <option value="email">Email</option>
        </select>
      </Field>
      <Field label="Service area" htmlFor="service_area"
        hint="Home service is currently available only within Ilorin.">
        <select id="service_area" name="service_area"
          defaultValue={customerProfile.service_area} className={inputClass}>
          {serviceAreas.map((a) => (
            <option key={a} value={a}>
              {a[0].toUpperCase() + a.slice(1)}
            </option>
          ))}
          <option value="other">Other (salon visits only)</option>
        </select>
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3.5">
        <input type="checkbox" name="service_area_confirmed" className="mt-1 h-5 w-5 accent-brand-600"
          defaultChecked={customerProfile.service_area_confirmed} />
        <span className="text-sm">
          <span className="font-semibold">I confirm my service area is correct.</span>
          <span className="block text-ink-soft">Required before you can book appointments.</span>
        </span>
      </label>

      <fieldset className="grid gap-2 rounded-xl border border-line bg-white p-3.5">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Notifications</legend>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="notify_booking_reminders" className="h-5 w-5 accent-brand-600"
            defaultChecked={prefs.booking_reminders !== false} />
          Appointment reminders
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="notify_renewal_reminders" className="h-5 w-5 accent-brand-600"
            defaultChecked={prefs.renewal_reminders !== false} />
          Renewal reminders
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="notify_promotions" className="h-5 w-5 accent-brand-600"
            defaultChecked={prefs.promotions === true} />
          Offers and promotions
        </label>
      </fieldset>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="marketing_consent" className="h-5 w-5 accent-brand-600"
          defaultChecked={customerProfile.marketing_consent} />
        I&apos;m happy to receive occasional marketing messages.
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
