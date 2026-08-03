import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatDateTime, formatDuration, formatNaira } from "@/lib/format";
import { AppointmentStatusBadge, Card, statusLabel } from "@/components/ui";
import type { Row } from "@/lib/db-rows";
import { BookingActions } from "@/components/admin/booking-actions";
import { ConsumptionPanel } from "@/components/admin/consumption-panel";

export const metadata: Metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffOrAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rows }, { data: stylists }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "*, service:services(name, required_skill), child:children(full_name), salon:salons(name, city), " +
          "customer:customer_profiles(id, whatsapp_number, address, city, profile:profiles(full_name, phone)), " +
          "stylist:profiles!appointments_stylist_profile_id_fkey(id, full_name), " +
          "extras:appointment_extra_services(extra_service_id, price_kobo, duration_minutes, payment_requirement, extra_service:extra_services(name)), " +
          "history:appointment_status_history(previous_status, new_status, reason, created_at), " +
          "reschedules:appointment_reschedule_history(old_starts_at, new_starts_at, reason, created_at), " +
          "notes:appointment_internal_notes(note, created_at, author:profiles(full_name))",
      )
      .eq("id", id)
      .limit(1),
    supabase
      .from("profiles")
      .select("id, full_name, skills:stylist_skills(skill)")
      .in("role", ["staff", "admin"])
      .eq("is_active", true),
  ]);
  const appt = ((rows ?? []) as Row[])[0];
  if (!appt) notFound();

  const cust = appt.customer as unknown as {
    id: string; whatsapp_number: string | null; address: string | null; city: string | null;
    profile: { full_name: string; phone: string | null };
  };
  const service = appt.service as unknown as { name: string; required_skill: string | null };
  const requiredSkill = service?.required_skill ?? null;
  const eligibleStylists = (stylists ?? []).filter(
    (s) =>
      !requiredSkill ||
      (s.skills as Array<{ skill: string }>).some((k) => k.skill === requiredSkill),
  );

  /* --- inventory consumption (only relevant once completed) --------------- */
  let usage: Row | null = null;
  let prefill: Array<{ item_id: string; name: string; unit: string; planned: number }> = [];
  let availableItems: Array<{ id: string; name: string; unit: string; quantity_available: number }> = [];
  if (appt.status === "completed") {
    const extraIds = (appt.extras as Array<{ extra_service_id: string }>)
      .map((e) => e.extra_service_id);
    const [{ data: usageRows }, { data: svcTpl }, { data: extraTpl }, { data: invItems }] =
      await Promise.all([
        supabase
          .from("appointment_inventory_usage")
          .select("*, items:appointment_inventory_usage_items(planned_quantity, actual_quantity, unit, variance_reason, item:inventory_items(name))")
          .eq("appointment_id", appt.id)
          .limit(1),
        supabase
          .from("service_consumption_templates")
          .select("item_id, standard_quantity, unit, item:inventory_items(name)")
          .eq("service_id", appt.service_id)
          .eq("is_active", true),
        extraIds.length > 0
          ? supabase
              .from("service_consumption_templates")
              .select("item_id, standard_quantity, unit, item:inventory_items(name)")
              .in("extra_service_id", extraIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [] }),
        supabase
          .from("salon_product_stock")
          .select("quantity_available, item:inventory_items!inner(id, name, unit, is_active, salon_use_available)")
          .eq("salon_id", appt.salon_id)
          .eq("inventory_items.is_active", true)
          .eq("inventory_items.salon_use_available", true),
      ]);
    usage = ((usageRows ?? []) as Row[])[0] ?? null;
    const merged = new Map<string, { item_id: string; name: string; unit: string; planned: number }>();
    for (const t of [...(svcTpl ?? []), ...(extraTpl ?? [])] as Row[]) {
      const prev = merged.get(t.item_id);
      merged.set(t.item_id, {
        item_id: t.item_id,
        name: (t.item as { name: string })?.name ?? "Item",
        unit: t.unit,
        planned: (prev?.planned ?? 0) + Number(t.standard_quantity),
      });
    }
    prefill = [...merged.values()];
    availableItems = ((invItems ?? []) as Row[])
      .map((r) => ({
        id: (r.item as Row).id as string,
        name: (r.item as Row).name as string,
        unit: (r.item as Row).unit as string,
        quantity_available: Number(r.quantity_available),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{service?.name}</h1>
          <p className="text-sm text-ink-soft">{formatDateTime(appt.starts_at)}</p>
        </div>
        <AppointmentStatusBadge status={appt.status} />
      </div>

      <Card>
        <p className="font-semibold">Customer</p>
        <p className="mt-1 text-sm">
          <Link href={`/admin/customers/${cust.id}`} className="font-semibold text-brand-600 underline-offset-2 hover:underline">
            {cust?.profile?.full_name}
          </Link>
          {appt.child && (
            <span className="text-ink-soft">
              {" "}· booking for {(appt.child as { full_name: string }).full_name}
            </span>
          )}
        </p>
        <p className="text-sm text-ink-soft">
          {cust?.profile?.phone} · WhatsApp {cust?.whatsapp_number ?? "—"}
        </p>
        {appt.salon && (
          <p className="mt-1 text-sm text-ink-soft">
            Salon: {(appt.salon as { name: string; city: string }).name}
          </p>
        )}
        {appt.was_home_visit && (
          <p className="mt-1 text-sm text-amber-700">
            Historical home-service visit (retired model)
          </p>
        )}
        {appt.customer_notes && (
          <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
            “{appt.customer_notes}”
          </p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Services &amp; add-ons</p>
        <dl className="mt-2 grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt>{service?.name} (subscription visit)</dt>
            <dd className="font-semibold text-emerald-700">Included</dd>
          </div>
          {(appt.extras as Array<{ price_kobo: number; payment_requirement: string; extra_service: { name: string } }>).map((e, i) => (
            <div key={i} className="flex justify-between">
              <dt>
                {e.extra_service.name}
                {e.payment_requirement === "pay_before_confirmation" && (
                  <span className="ml-1 text-xs text-amber-700">(pre-pay)</span>
                )}
              </dt>
              <dd className="font-semibold">{formatNaira(e.price_kobo)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="text-ink-soft">Duration</dt>
            <dd className="font-semibold">{formatDuration(appt.duration_minutes)}</dd>
          </div>
          {appt.addon_total_kobo > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Add-on total (pending value)</dt>
              <dd className="font-bold text-brand-700">{formatNaira(appt.addon_total_kobo)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <BookingActions
        appointmentId={appt.id}
        status={appt.status}
        currentStylistId={(appt.stylist as { id: string } | null)?.id ?? null}
        currentStylistName={(appt.stylist as { full_name: string } | null)?.full_name ?? null}
        stylists={eligibleStylists.map((s) => ({ id: s.id, name: s.full_name }))}
        requiredSkill={requiredSkill}
      />

      {appt.status === "completed" && (
        <Card>
          <p className="font-semibold">Products used (inventory)</p>
          {usage ? (
            <div className="mt-2">
              <p className="text-sm text-emerald-700">
                Recorded {formatDateTime(usage.posted_at)} — stock already deducted.
              </p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-1.5">Item</th>
                    <th className="py-1.5 text-right">Planned</th>
                    <th className="py-1.5 text-right">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage.items as Row[]).map((it, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5">
                        {(it.item as { name: string })?.name}
                        {it.variance_reason && (
                          <span className="block text-xs text-amber-700">
                            {it.variance_reason}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-ink-soft">
                        {Number(it.planned_quantity)} {it.unit}
                      </td>
                      <td className="py-1.5 text-right font-semibold">
                        {Number(it.actual_quantity)} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-2">
              <ConsumptionPanel
                appointmentId={appt.id}
                prefill={prefill}
                available={availableItems}
              />
            </div>
          )}
        </Card>
      )}

      {(appt.notes as Array<{ note: string; created_at: string; author: { full_name: string } }>).length > 0 && (
        <Card>
          <p className="font-semibold">Internal notes (never shown to the customer)</p>
          <ul className="mt-2 grid gap-2 text-sm">
            {(appt.notes as Array<{ note: string; created_at: string; author: { full_name: string } }>).map((n, i) => (
              <li key={i} className="rounded-xl bg-brand-50 px-3 py-2">
                {n.note}
                <span className="block text-xs text-ink-soft">
                  {n.author?.full_name} · {formatDateTime(n.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <p className="font-semibold">Status history</p>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {(appt.history as Array<{ previous_status: string | null; new_status: string; reason: string | null; created_at: string }>)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((h, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {h.previous_status ? `${statusLabel(h.previous_status)} → ` : ""}
                  <strong>{statusLabel(h.new_status)}</strong>
                  {h.reason && <span className="text-ink-soft"> — {h.reason}</span>}
                </span>
                <span className="shrink-0 text-xs text-ink-soft">{formatDateTime(h.created_at)}</span>
              </li>
            ))}
        </ul>
        {(appt.reschedules as Array<{ old_starts_at: string; new_starts_at: string; created_at: string }>).length > 0 && (
          <>
            <p className="mt-3 font-semibold">Reschedule history</p>
            <ul className="mt-1 grid gap-1.5 text-sm text-ink-soft">
              {(appt.reschedules as Array<{ old_starts_at: string; new_starts_at: string; created_at: string }>).map((r, i) => (
                <li key={i}>
                  {formatDateTime(r.old_starts_at)} → {formatDateTime(r.new_starts_at)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
