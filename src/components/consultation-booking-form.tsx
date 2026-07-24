"use client";

import { useState, useTransition } from "react";
import { bookConsultation } from "@/server/actions/customer";
import { Field, buttonClass, inputClass } from "@/components/ui";

export function ConsultationBookingForm({
  consultationTypeId,
  childOptions,
  minNoticeHours,
  maxAdvanceDays,
}: {
  consultationTypeId: string;
  childOptions: Array<{ id: string; name: string }>;
  minNoticeHours: number;
  maxAdvanceDays: number;
}) {
  const [who, setWho] = useState<string>("self");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [concerns, setConcerns] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [now] = useState(() => new Date());
  const minDate = new Date(now.getTime() + minNoticeHours * 3_600_000)
    .toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const maxDate = new Date(now.getTime() + maxAdvanceDays * 86_400_000)
    .toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  return (
    <div className="grid gap-4">
      {childOptions.length > 0 && (
        <Field label="Who is this consultation for?" htmlFor="who">
          <select id="who" className={inputClass} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="self">Myself</option>
            {childOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred date" htmlFor="cdate">
          <input id="cdate" type="date" className={inputClass} min={minDate} max={maxDate}
            value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Preferred time" htmlFor="ctime">
          <input id="ctime" type="time" className={inputClass} min="09:00" max="18:00"
            value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field
        label="What would you like help with?"
        htmlFor="concerns"
        hint="Photo uploads arrive with the payments phase — describe your concern for now."
      >
        <textarea id="concerns" rows={4} className={inputClass} maxLength={2000}
          value={concerns} onChange={(e) => setConcerns(e.target.value)}
          placeholder="e.g. breakage at the temples, dry scalp, postpartum shedding…" />
      </Field>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        className={buttonClass("primary")}
        disabled={pending || !date || concerns.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await bookConsultation({
              consultation_type_id: consultationTypeId,
              child_id: who === "self" ? null : who,
              requested_at: `${date}T${time}:00+01:00`,
              concerns,
            });
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Submitting…" : "Submit consultation request"}
      </button>
    </div>
  );
}
