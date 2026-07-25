"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addStaffSkill,
  createStaffMember,
  removeStaffSkill,
  saveStaffHours,
  setStaffActive,
  type ActionState,
} from "@/server/actions/staff";
import { Field, buttonClass, inputClass } from "@/components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function CreateStaffForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createStaffMember,
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="staff-name">
          <input id="staff-name" name="full_name" required minLength={2} className={inputClass} />
        </Field>
        <Field label="Email (their login)" htmlFor="staff-email">
          <input id="staff-email" name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Phone (optional)" htmlFor="staff-phone">
          <input id="staff-phone" name="phone" type="tel" className={inputClass} />
        </Field>
        <Field label="Role" htmlFor="staff-role">
          <select id="staff-role" name="role" defaultValue="staff" className={inputClass}>
            <option value="staff">Staff / stylist</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </Field>
        <Field
          label="Temporary password"
          htmlFor="staff-password"
          hint="Share it with them privately; they should change it after first login."
        >
          <input id="staff-password" name="password" type="text" required minLength={8} className={inputClass} />
        </Field>
        <Field
          label="Skills (comma-separated)"
          htmlFor="staff-skills"
          hint="e.g. natural-hair, kids-hair, colouring — used for assignment matching."
        >
          <input id="staff-skills" name="skills" className={inputClass} placeholder="natural-hair, kids-hair" />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "justify-self-start")}>
        {pending ? "Creating account…" : "Create staff account"}
      </button>
    </form>
  );
}

export function StaffSkills({
  profileId,
  skills,
}: {
  profileId: string;
  skills: string[];
}) {
  const [newSkill, setNewSkill] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-ink-soft">Skills</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {skills.length === 0 && (
          <span className="text-sm text-ink-soft">No skills yet.</span>
        )}
        {skills.map((skill) => (
          <button
            key={skill}
            title="Remove skill"
            className="group rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await removeStaffSkill(profileId, skill);
              })
            }
          >
            {skill} <span className="text-brand-400 group-hover:text-red-600">✕</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Add a skill…"
          value={newSkill}
          maxLength={60}
          onChange={(e) => setNewSkill(e.target.value)}
        />
        <button
          className={buttonClass("outline")}
          disabled={pending || !newSkill.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await addStaffSkill(profileId, newSkill);
              setError(r.error ?? null);
              if (!r.error) setNewSkill("");
            })
          }
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function StaffHoursForm({
  profileId,
  hours,
}: {
  profileId: string;
  hours: Array<{ day_of_week: number; start_time: string; end_time: string }>;
}) {
  const bound = saveStaffHours.bind(null, profileId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  return (
    <form action={action} className="grid gap-2">
      {DAYS.map((label, d) => {
        const row = hours.find((h) => h.day_of_week === d);
        return (
          <div key={d} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
            <label className="flex w-32 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name={`works_${d}`} defaultChecked={!!row}
                className="h-5 w-5 accent-brand-600" />
              {label}
            </label>
            <input type="time" name={`start_${d}`}
              defaultValue={row ? String(row.start_time).slice(0, 5) : "09:00"}
              className="min-h-10 rounded-lg border border-line px-2 text-sm" />
            <span className="text-ink-soft">to</span>
            <input type="time" name={`end_${d}`}
              defaultValue={row ? String(row.end_time).slice(0, 5) : "18:00"}
              className="min-h-10 rounded-lg border border-line px-2 text-sm" />
          </div>
        );
      })}
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("outline", "justify-self-start")}>
        {pending ? "Saving…" : "Save hours"}
      </button>
    </form>
  );
}

export function StaffActiveToggle({
  profileId,
  active,
  name,
}: {
  profileId: string;
  active: boolean;
  name: string;
}) {
  const [message, setMessage] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <button
        className={buttonClass(active ? "danger" : "outline", "justify-self-start")}
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm(`Deactivate ${name}? They will no longer be able to sign in or be assigned.`)) {
            return;
          }
          startTransition(async () =>
            setMessage(await setStaffActive(profileId, !active)),
          );
        }}
      >
        {pending ? "…" : active ? "Deactivate account" : "Reactivate account"}
      </button>
      {message.error && <p className="text-sm text-red-700">{message.error}</p>}
      {message.success && <p className="text-sm text-emerald-700">{message.success}</p>}
    </div>
  );
}
