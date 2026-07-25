import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import {
  addBlackoutDate,
  removeBlackoutDate,
  saveBusinessHours,
  saveSchedulingSettings,
} from "@/server/actions/admin";
import { ActionButton, ActionForm } from "@/components/action-form";
import { formatDate } from "@/lib/format";
import { Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Scheduling Settings" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const capitalise = (s: string) =>
  s.replace(/\b\w/g, (c) => c.toUpperCase());

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: settings }, { data: hours }, { data: blackouts }] = await Promise.all([
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("business_hours").select("*").order("day_of_week"),
    supabase
      .from("blackout_dates")
      .select("*")
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date"),
  ]);
  const s = settings?.[0];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Scheduling Settings
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Control booking intervals, daily capacity, operating hours and
          unavailable dates.
        </p>
      </div>

      {/* ------------------------------------------------- Booking Rules */}
      <Card>
        <p className="font-semibold">Booking Rules</p>
        <p className="mb-4 mt-0.5 text-sm text-ink-soft">
          How far ahead customers can book, how much notice is needed, and how
          many appointments fit at once.
        </p>
        {s && (
          <ActionForm action={saveSchedulingSettings} submitLabel="Save Settings" warnUnsaved>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Slot duration (minutes)"
                htmlFor="slot_duration_minutes"
                hint="The gap between bookable start times shown to customers."
              >
                <select id="slot_duration_minutes" name="slot_duration_minutes"
                  defaultValue={s.slot_duration_minutes} className={inputClass}>
                  {[15, 20, 30, 45, 60].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Max bookings per slot"
                htmlFor="max_bookings_per_slot"
                hint="How many customers your team can serve at the same time."
              >
                <input id="max_bookings_per_slot" name="max_bookings_per_slot" type="number" min={1} max={20}
                  defaultValue={s.max_bookings_per_slot} className={inputClass} />
              </Field>
              <Field
                label="Minimum booking notice (hours)"
                htmlFor="min_booking_notice_hours"
                hint="Bookings closer to now than this are rejected."
              >
                <input id="min_booking_notice_hours" name="min_booking_notice_hours" type="number" min={0} max={168}
                  defaultValue={s.min_booking_notice_hours} className={inputClass} />
              </Field>
              <Field
                label="Maximum booking window (days)"
                htmlFor="max_advance_booking_days"
                hint="How far into the future customers can book."
              >
                <input id="max_advance_booking_days" name="max_advance_booking_days" type="number" min={1} max={180}
                  defaultValue={s.max_advance_booking_days} className={inputClass} />
              </Field>
              <Field
                label="Reschedule deadline (hours before)"
                htmlFor="reschedule_deadline_hours"
                hint="Customers cannot reschedule closer to the visit than this; staff can."
              >
                <input id="reschedule_deadline_hours" name="reschedule_deadline_hours" type="number" min={0} max={168}
                  defaultValue={s.reschedule_deadline_hours} className={inputClass} />
              </Field>
              <Field
                label="Home-service capacity per day"
                htmlFor="home_service_capacity_per_day"
                hint="Total home visits your team can handle each day."
              >
                <input id="home_service_capacity_per_day" name="home_service_capacity_per_day" type="number" min={0} max={50}
                  defaultValue={s.home_service_capacity_per_day} className={inputClass} />
              </Field>
            </div>
            <Field
              label="Supported home-service areas (comma-separated)"
              htmlFor="supported_service_areas"
              hint="Customers outside these areas can only book salon visits. Currently: Ilorin."
            >
              <input id="supported_service_areas" name="supported_service_areas"
                defaultValue={(s.supported_service_areas as string[]).map(capitalise).join(", ")}
                className={inputClass} />
            </Field>
          </ActionForm>
        )}
      </Card>

      {/* ------------------------------------------------- Opening Hours */}
      <Card>
        <p className="font-semibold">Opening Hours</p>
        <p className="mb-4 mt-0.5 text-sm text-ink-soft">
          Untick a day to close it. Weekend hours are set here too — Saturday
          bookings are popular, so keep it open if you can.
        </p>
        <ActionForm action={saveBusinessHours} submitLabel="Save Hours" warnUnsaved>
          <div className="grid gap-2">
            {(hours ?? []).map((h) => (
              <div key={h.day_of_week} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                <label className="flex w-32 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name={`open_${h.day_of_week}`} className="h-5 w-5 accent-brand-600"
                    defaultChecked={h.is_open} />
                  {DAYS[h.day_of_week]}
                </label>
                <input type="time" name={`open_time_${h.day_of_week}`}
                  defaultValue={String(h.open_time).slice(0, 5)}
                  className="min-h-10 rounded-lg border border-line px-2 text-sm" />
                <span className="text-ink-soft">to</span>
                <input type="time" name={`close_time_${h.day_of_week}`}
                  defaultValue={String(h.close_time).slice(0, 5)}
                  className="min-h-10 rounded-lg border border-line px-2 text-sm" />
              </div>
            ))}
          </div>
        </ActionForm>
      </Card>

      {/* ------------------------------------------------ Blackout Dates */}
      <Card>
        <div id="blackout-dates" className="scroll-mt-20">
          <p className="font-semibold">Blackout Dates</p>
          <p className="mb-4 mt-0.5 text-sm text-ink-soft">
            Days the salon is closed regardless of opening hours — holidays,
            Eid, training days. No bookings can be made on these dates.
          </p>
        </div>
        <ActionForm action={addBlackoutDate} submitLabel="Add Blackout Date"
          className="flex flex-wrap items-end gap-3">
          <Field label="Date" htmlFor="blackout-date">
            <input id="blackout-date" type="date" name="date" required className={inputClass} />
          </Field>
          <Field label="Reason" htmlFor="blackout-reason">
            <input id="blackout-reason" name="reason" placeholder="e.g. Eid holiday" className={inputClass} />
          </Field>
        </ActionForm>

        {(blackouts ?? []).length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-brand-50 px-4 py-3 text-sm text-ink-soft">
            No upcoming blackout dates.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-brand-50 text-left text-ink-soft">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(blackouts ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold">{formatDate(b.date)}</td>
                    <td className="px-3 py-2 text-ink-soft">{b.reason || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <ActionButton
                        action={removeBlackoutDate.bind(null, b.id)}
                        label="Remove"
                        variant="danger"
                        confirm={`Remove the blackout on ${formatDate(b.date)}? Customers will be able to book that day again.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
