import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveCapacitySettings } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import {
  capacityWarnings,
  utilizationPercent,
  weeklySlotCapacity,
} from "@/lib/operations";
import { Badge, Card, Field, inputClass, Meter } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Capacity" };
export const dynamic = "force-dynamic";

export default async function CapacityPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [
    { data: settingsRows }, { data: salons }, { data: salonSettings },
    { data: hours }, { data: plans }, { data: subs }, { data: entitlements },
  ] = await Promise.all([
    supabase.from("subscription_capacity_settings").select("*").limit(1),
    supabase.from("salons").select("id, name, city, chair_capacity").eq("status", "open"),
    supabase.from("salon_settings").select("*"),
    supabase.from("salon_hours").select("*"),
    supabase.from("subscription_plans").select("id, name, subscriber_limit, visits_included").is("archived_at", null),
    supabase.from("subscriptions").select("id, plan_id, status")
      .in("status", ["active", "expiring_soon", "renewal_due"]),
    supabase.from("visit_entitlements").select("status, cycle:subscription_cycles!inner(status)")
      .eq("subscription_cycles.status", "active"),
  ]);
  const settings = settingsRows?.[0] as Row;

  const active = (subs ?? []) as Row[];
  const ents = (entitlements ?? []) as Row[];
  const promised = ents.length;
  const completed = ents.filter((e) => e.status === "consumed").length;
  const reserved = ents.filter((e) => e.status === "reserved").length;
  const remaining = ents.filter((e) => e.status === "available").length;

  // Slot supply = sum across OPEN salons (availability is per salon).
  const weeklySlots = ((salons ?? []) as Row[]).reduce((sum, salon) => {
    const ss = ((salonSettings ?? []) as Row[]).find((x) => x.salon_id === salon.id);
    const salonHours = ((hours ?? []) as Row[]).filter((h) => h.salon_id === salon.id);
    return sum + weeklySlotCapacity(
      salonHours as never,
      ss?.slot_duration_minutes ?? 30,
      Math.min(ss?.max_bookings_per_slot ?? 3, salon.chair_capacity ?? 3));
  }, 0);
  const monthlySlots = Math.round(weeklySlots * 4.33);
  const util = utilizationPercent(promised, monthlySlots);

  const warnings = capacityWarnings({
    utilizationPercent: util,
    warningThreshold: settings?.warning_threshold_percent ?? 80,
    visitsRemaining: remaining + reserved,
    slotsRemaining: Math.max(0, monthlySlots - completed),
    subscribersWithoutBookings: 0, // detailed view lives in Retention
    activeSubscribers: active.length,
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Subscription Capacity</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Can the salon comfortably serve every promised visit? Estimated from
          active cycles, opening hours and slot capacity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Visits promised", promised],
          ["Completed", completed],
          ["Reserved", reserved],
          ["Remaining", remaining],
          ["Monthly slot supply", monthlySlots],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <p className="font-display text-2xl font-bold text-brand-900">{value}</p>
            <p className="text-sm text-ink-soft">{label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Capacity utilisation</p>
          <Badge tone={util >= 90 ? "red" : util >= (settings?.warning_threshold_percent ?? 80) ? "amber" : "green"}>
            {util}%
          </Badge>
        </div>
        <div className="mt-2"><Meter value={Math.min(util, 100)} max={100} /></div>
        <p className="mt-1.5 text-xs text-ink-soft">
          {promised} promised visits vs ~{monthlySlots} bookable slots this
          month ({weeklySlots}/week across all open salons).
        </p>
      </Card>

      {warnings.length > 0 && (
        <div className="grid gap-2.5">
          {warnings.map((w, i) => (
            <Card key={i} className={
              w.severity === "critical" ? "border-red-200 bg-red-50"
                : w.severity === "warning" ? "border-amber-200 bg-amber-50"
                  : "border-line"}>
              <p className="font-semibold">{w.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{w.explanation}</p>
              <p className="mt-1 text-sm">
                <Link href={w.href} className="font-semibold text-brand-600 hover:underline">
                  {w.action} →
                </Link>
              </p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <p className="font-semibold">Subscribers per plan vs limits</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {((plans ?? []) as Row[]).map((p) => {
              const count = active.filter((x) => x.plan_id === p.id).length;
              const full = p.subscriber_limit != null && count >= p.subscriber_limit;
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-ink-soft">{p.visits_included} visits/cycle</td>
                  <td className="py-2 text-right">
                    <Badge tone={full ? "red" : "green"}>
                      {count}{p.subscriber_limit != null ? ` / ${p.subscriber_limit}` : " (no limit)"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-soft">
          Per-plan limits are edited on each plan. Activations beyond a limit
          are blocked unless an admin overrides with a reason (audited).
        </p>
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Capacity limits & thresholds</p>
        {settings && (
          <ActionForm action={saveCapacitySettings} submitLabel="Save capacity settings" warnUnsaved>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Global active-subscriber limit (blank = none)" htmlFor="global_limit">
                <input id="global_limit" name="global_limit" type="number" min={1}
                  defaultValue={settings.global_active_subscriber_limit ?? ""} className={inputClass} />
              </Field>
              <Field label="Max promised visits per cycle" htmlFor="max_visits">
                <input id="max_visits" name="max_visits" type="number" min={1}
                  defaultValue={settings.max_promised_visits_per_cycle ?? ""} className={inputClass} />
              </Field>
              <Field label="Warning threshold (%)" htmlFor="warning_threshold">
                <input id="warning_threshold" name="warning_threshold" type="number" min={1} max={100}
                  defaultValue={settings.warning_threshold_percent} className={inputClass} />
              </Field>
              <Field label="Hard-stop threshold (%)" htmlFor="hard_stop_threshold">
                <input id="hard_stop_threshold" name="hard_stop_threshold" type="number" min={1} max={150}
                  defaultValue={settings.hard_stop_threshold_percent} className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" name="enforce_hard_stop" className="h-5 w-5 accent-brand-600"
                  defaultChecked={settings.enforce_hard_stop} />
                Block activations at the limits
              </label>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
