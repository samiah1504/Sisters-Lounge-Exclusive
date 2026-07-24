"use client";

import { useActionState } from "react";
import { saveChild, type ActionState } from "@/server/actions/customer";
import { Field, buttonClass, inputClass } from "@/components/ui";
import type { Child } from "@/lib/types";

export function ChildForm({ child }: { child: Child | null }) {
  const bound = saveChild.bind(null, child?.id ?? null);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name" htmlFor="full_name">
        <input id="full_name" name="full_name" required minLength={2}
          defaultValue={child?.full_name ?? ""} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of birth" htmlFor="date_of_birth">
          <input id="date_of_birth" name="date_of_birth" type="date" required
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={child?.date_of_birth ?? ""} className={inputClass} />
        </Field>
        <Field label="Gender (optional)" htmlFor="gender">
          <select id="gender" name="gender" defaultValue={child?.gender ?? ""} className={inputClass}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
      </div>
      <Field label="Allergies" htmlFor="allergies" hint="e.g. nut oils, latex — anything the stylist must avoid.">
        <textarea id="allergies" name="allergies" rows={2}
          defaultValue={child?.allergies ?? ""} className={inputClass} />
      </Field>
      <Field label="Sensitivities" htmlFor="sensitivities" hint="e.g. tender scalp, sensitive skin.">
        <textarea id="sensitivities" name="sensitivities" rows={2}
          defaultValue={child?.sensitivities ?? ""} className={inputClass} />
      </Field>
      <Field label="Hair & scalp notes" htmlFor="hair_scalp_notes">
        <textarea id="hair_scalp_notes" name="hair_scalp_notes" rows={2}
          defaultValue={child?.hair_scalp_notes ?? ""} className={inputClass} />
      </Field>
      <Field label="General service notes" htmlFor="service_notes">
        <textarea id="service_notes" name="service_notes" rows={2}
          defaultValue={child?.service_notes ?? ""} className={inputClass} />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Saving…" : child ? "Save changes" : "Add child"}
      </button>
    </form>
  );
}
