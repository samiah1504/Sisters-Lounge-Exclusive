import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import {
  addBlackoutDate,
  removeBlackoutDate,
  saveBusinessHours,
  saveSalonSettings,
  saveSchedulingSettings,
} from "@/server/actions/admin";
import { ActionButton, ActionForm } from "@/components/action-form";
import { formatDate } from "@/lib/format";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Scheduling Settings" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ salon?: string }>;
}) {
  await requireAdmin();
  const { salon: salonParam } = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: salons }] = await Promise.all([
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("salons").select("*").in("status", ["open", "paused"])
      .order("created_at"),
  ]);
  const s = settings?.[0];
  const salonList = (salons ?? []) as Row[];
  const salon =
    salonList.find((x) => x.id === salonParam) ?? salonList[0] ?? null;

  const [{ data: salonSettings }, { data: hours }, { data: blackouts }] =
    salon
      ? await Promise.all([
          supabase.from("salon_settings").select("*")
            .eq("salon_id", salon.id).limit(1),
          supabase.from("salon_hours").select("*")
            .eq("salon_id", salon.id).order("day_of_week"),
          supabase.from("salon_blackout_dates").select("*")
            .eq("salon_id", salon.id)
            .gte("date", new Date().toISOString().slice(0, 10))
            .order("date"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const ss = (salonSettings?.[0] ?? null) as Row | null;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Scheduling Settings
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Brand-wide reservation rules, plus hours, capacity and unavailable
          dates for each salon.
        </p>
      </div>

      {/* --------------------------------------- Brand-wide booking rules */}
      <Card>
        <p className="font-semibold">Reservation Rules (all salons)</p>
        <p className="mb-4 mt-0.5 text-sm text-ink-soft">
          How far ahead members can reserve and how much notice is needed —
          the same across every Sisters Lounge Salon.
        </p>
        {s && (
          <ActionForm action={saveSchedulingSettings} submitLabel="Save Settings" warnUnsaved>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Minimum notice (hours)"
                htmlFor="min_booking_notice_hours"
                hint="Reservations closer to now than this are rejected."
              >
                <input id="min_booking_notice_hours" name="min_booking_notice_hours" type="number" min={0} max={168}
                  defaultValue={s.min_booking_notice_hours} className={inputClass} />
              </Field>
              <Field
                label="Maximum window (days)"
                htmlFor="max_advance_booking_days"
                hint="How far into the future members can reserve."
              >
                <input id="max_advance_booking_days" name="max_advance_booking_days" type="number" min={1} max={180}
                  defaultValue={s.max_advance_booking_days} className={inputClass} />
              </Field>
              <Field
                label="Reschedule deadline (hours before)"
                htmlFor="reschedule_deadline_hours"
                hint="Members cannot reschedule closer to the visit than this; staff can."
              >
                <input id="reschedule_deadline_hours" name="reschedule_deadline_hours" type="number" min={0} max={168}
                  defaultValue={s.reschedule_deadline_hours} className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        )}
      </Card>

      {/* ------------------------------------------------- salon selector */}
      {salonList.length > 1 && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {salonList.map((x) => (
            <Link key={x.id} href={`/admin/settings?salon=${x.id}`}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${salon?.id === x.id ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
              {x.city}
            </Link>
          ))}
        </div>
      )}

      {salon && (
        <>
          <div className="flex items-center gap-2">
            <p className="font-display text-lg text-ink">{salon.name}</p>
            <Badge tone={salon.status === "open" ? "green" : "amber"}>{salon.status}</Badge>
          </div>

          {/* ------------------------------------------- Salon capacity */}
          <Card>
            <p className="font-semibold">Capacity &amp; slots at this salon</p>
            <p className="mb-4 mt-0.5 text-sm text-ink-soft">
              Slot spacing, concurrent chairs, and the no-show grace period.
            </p>
            <ActionForm action={saveSalonSettings.bind(null, salon.id)}
              submitLabel="Save Salon Settings" warnUnsaved>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Slot duration (minutes)"
                  htmlFor="slot_duration_minutes"
                  hint="The gap between bookable start times shown to members."
                >
                  <select id="slot_duration_minutes" name="slot_duration_minutes"
                    defaultValue={ss?.slot_duration_minutes ?? 30} className={inputClass}>
                    {[15, 20, 30, 45, 60].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Max reservations per slot"
                  htmlFor="max_bookings_per_slot"
                  hint={`Capped by this salon's ${salon.chair_capacity} chairs.`}
                >
                  <input id="max_bookings_per_slot" name="max_bookings_per_slot" type="number" min={1} max={20}
                    defaultValue={ss?.max_bookings_per_slot ?? 3} className={inputClass} />
                </Field>
                <Field
                  label="No-show grace (minutes)"
                  htmlFor="no_show_grace_minutes"
                  hint="Staff can mark a visit missed only after this grace period."
                >
                  <input id="no_show_grace_minutes" name="no_show_grace_minutes" type="number" min={0} max={120}
                    defaultValue={ss?.no_show_grace_minutes ?? 20} className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          </Card>

          {/* --------------------------------------------- Opening hours */}
          <Card>
            <p className="font-semibold">Opening Hours — {salon.city}</p>
            <p className="mb-4 mt-0.5 text-sm text-ink-soft">
              Untick a day to close it. Saturday reservations are popular, so
              keep it open if you can.
            </p>
            <ActionForm action={saveBusinessHours.bind(null, salon.id)}
              submitLabel="Save Hours" warnUnsaved>
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

          {/* -------------------------------------------- Blackout dates */}
          <Card>
            <div id="blackout-dates" className="scroll-mt-20">
              <p className="font-semibold">Blackout Dates — {salon.city}</p>
              <p className="mb-4 mt-0.5 text-sm text-ink-soft">
                Days this salon is closed regardless of opening hours —
                holidays, Eid, training days.
              </p>
            </div>
            <ActionForm action={addBlackoutDate.bind(null, salon.id)}
              submitLabel="Add Blackout Date"
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
                            confirm={`Remove the blackout on ${formatDate(b.date)}? Members will be able to reserve that day again.`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
