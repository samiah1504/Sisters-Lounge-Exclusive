"use client";

import { useEffect, useState, useTransition } from "react";
import { rescheduleAppointment } from "@/server/actions/customer";
import { formatTime } from "@/lib/format";
import { buttonClass, inputClass } from "@/components/ui";

export function RescheduleForm({
  appointmentId,
  durationMinutes,
  salonId,
  minNoticeHours,
  maxAdvanceDays,
}: {
  appointmentId: string;
  durationMinutes: number;
  salonId: string;
  minNoticeHours: number;
  maxAdvanceDays: number;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [now] = useState(() => new Date());
  const minDate = new Date(now.getTime() + minNoticeHours * 3_600_000)
    .toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const maxDate = new Date(now.getTime() + maxAdvanceDays * 86_400_000)
    .toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!date) return;
      if (!cancelled) setLoading(true);
      try {
        const r = await fetch(
          `/api/slots?date=${date}&salon=${salonId}&duration=${durationMinutes}`,
        );
        const j = await r.json();
        if (!cancelled) setSlots(j.slots ?? []);
      } catch {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [date, salonId, durationMinutes]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="new-date" className="text-sm font-medium text-ink-soft">
          New date
        </label>
        <input
          id="new-date"
          type="date"
          className={inputClass}
          min={minDate}
          max={maxDate}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTime(null);
          }}
        />
      </div>

      {date && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">
            Available times{loading ? " (loading…)" : ""}
          </p>
          {!loading && slots.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No available times on this date — try another day.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.startsAt}
                onClick={() => setTime(s.startsAt)}
                className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${time === s.startsAt ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white"}`}
              >
                {formatTime(s.startsAt)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <label htmlFor="reason" className="text-sm font-medium text-ink-soft">
          Reason (optional)
        </label>
        <input
          id="reason"
          className={inputClass}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Helps the salon plan better"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        className={buttonClass("primary")}
        disabled={!time || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await rescheduleAppointment(appointmentId, time!, reason);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Rescheduling…" : "Confirm new time"}
      </button>
    </div>
  );
}
