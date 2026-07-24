import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import {
  addBlackoutDate,
  removeBlackoutDate,
  saveBusinessHours,
  saveSchedulingSettings,
} from "@/server/actions/admin";
import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/lib/format";
import { Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: settings }, { data: hours }, { data: blackouts }] = await Promise.all([
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("business_hours").select("*").order("day_of_week"),
    supabase.from("blackout_dates").select("*").gte("date", new Date().toISOString().slice(0, 10)).order("date"),
  ]);
  const s = settings?.[0];

  return (
    <div className="grid gap-5">
      <h1 className="heading-rule font-display text-2xl text-ink">Scheduling Settings</h1>

      <Card>
        <p className="mb-3 font-semibold">Booking rules</p>
        {s && (
          <ActionForm action={saveSchedulingSettings} submitLabel="Save settings">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Slot duration (minutes)" htmlFor="slot_duration_minutes">
                <select id="slot_duration_minutes" name="slot_duration_minutes"
                  defaultValue={s.slot_duration_minutes} className={inputClass}>
                  {[15, 20, 30, 45, 60].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Max bookings per slot" htmlFor="max_bookings_per_slot">
                <input id="max_bookings_per_slot" name="max_bookings_per_slot" type="number" min={1} max={20}
                  defaultValue={s.max_bookings_per_slot} className={inputClass} />
              </Field>
              <Field label="Minimum booking notice (hours)" htmlFor="min_booking_notice_hours">
                <input id="min_booking_notice_hours" name="min_booking_notice_hours" type="number" min={0} max={168}
                  defaultValue={s.min_booking_notice_hours} className={inputClass} />
              </Field>
              <Field label="Maximum booking window (days)" htmlFor="max_advance_booking_days">
                <input id="max_advance_booking_days" name="max_advance_booking_days" type="number" min={1} max={180}
                  defaultValue={s.max_advance_booking_days} className={inputClass} />
              </Field>
              <Field label="Reschedule deadline (hours before)" htmlFor="reschedule_deadline_hours">
                <input id="reschedule_deadline_hours" name="reschedule_deadline_hours" type="number" min={0} max={168}
                  defaultValue={s.reschedule_deadline_hours} className={inputClass} />
              </Field>
              <Field label="Home-service capacity per day" htmlFor="home_service_capacity_per_day">
                <input id="home_service_capacity_per_day" name="home_service_capacity_per_day" type="number" min={0} max={50}
                  defaultValue={s.home_service_capacity_per_day} className={inputClass} />
              </Field>
            </div>
            <Field label="Supported home-service areas (comma-separated)" htmlFor="supported_service_areas">
              <input id="supported_service_areas" name="supported_service_areas"
                defaultValue={(s.supported_service_areas as string[]).join(", ")} className={inputClass} />
            </Field>
          </ActionForm>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Opening hours (including weekend hours)</p>
        <ActionForm action={saveBusinessHours} submitLabel="Save hours">
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

      <Card>
        <p className="mb-3 font-semibold">Blackout dates</p>
        {(blackouts ?? []).length > 0 && (
          <ul className="mb-3 grid gap-2 text-sm">
            {(blackouts ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                <span>
                  <strong>{formatDate(b.date)}</strong>
                  {b.reason && <span className="text-ink-soft"> — {b.reason}</span>}
                </span>
                <form action={removeBlackoutDate.bind(null, b.id)}>
                  <button className="font-semibold text-red-700 hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addBlackoutDate} submitLabel="Add blackout date" className="flex flex-wrap items-end gap-3">
          <Field label="Date" htmlFor="blackout-date">
            <input id="blackout-date" type="date" name="date" required className={inputClass} />
          </Field>
          <Field label="Reason" htmlFor="blackout-reason">
            <input id="blackout-reason" name="reason" placeholder="e.g. Eid holiday" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
