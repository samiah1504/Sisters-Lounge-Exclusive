import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { addStaffAssignment, removeStaffAssignment } from "@/server/actions/salons";
import { SalonForm } from "@/components/admin/salon-form";
import { SalonLifecycle } from "@/components/admin/salon-lifecycle";
import { ActionButton, ActionForm } from "@/components/action-form";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Salon" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "gold" | "amber" | "gray" | "brand"> = {
  open: "green", waitlist: "gold", planned: "brand", paused: "amber", closed: "gray",
};

export default async function AdminSalonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: salons }, { data: assignments }, { data: staff },
         { data: upcoming }, { data: released }] =
    await Promise.all([
      supabase.from("salons").select("*").eq("id", id).limit(1),
      supabase.from("staff_salon_assignments")
        .select("id, is_primary, profile:profiles(id, full_name, role)")
        .eq("salon_id", id),
      supabase.from("profiles").select("id, full_name, role")
        .in("role", ["staff", "admin"]).eq("is_active", true).order("full_name"),
      supabase.from("appointments")
        .select("id, starts_at, status, customer:customer_profiles(id, whatsapp_number, profile:profiles(full_name, phone))")
        .eq("salon_id", id).gte("starts_at", nowIso)
        .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"])
        .order("starts_at").limit(50),
      // Members whose future visits were released by a pause/close (#34):
      // the contact list for "we're sorry, please rebook".
      supabase.from("appointments")
        .select("id, starts_at, customer:customer_profiles(id, whatsapp_number, profile:profiles(full_name, phone))")
        .eq("salon_id", id).gte("starts_at", nowIso)
        .eq("status", "cancelled_salon")
        .order("starts_at").limit(50),
    ]);
  const salon = ((salons ?? []) as Row[])[0];
  if (!salon) notFound();

  const assigned = new Set(((assignments ?? []) as Row[])
    .map((a) => (a.profile as Row)?.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl text-ink">{salon.name}</h1>
        <Badge tone={STATUS_TONE[salon.status] ?? "gray"}>{salon.status}</Badge>
      </div>

      <Card>
        <p className="mb-2 font-semibold">Status</p>
        <SalonLifecycle salonId={salon.id} status={salon.status} />
        {salon.status === "open" && (
          <p className="mt-2 text-sm">
            <Link className="font-semibold text-brand-600 hover:underline"
              href={`/admin/settings?salon=${salon.id}`}>
              Hours, capacity &amp; blackout dates →
            </Link>
          </p>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Details</p>
        <SalonForm salon={salon} />
      </Card>

      {/* ------------------------------------------- staff ↔ salon (§4.6) -- */}
      <Card>
        <p className="font-semibold">Staff at this salon</p>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {((assignments ?? []) as Row[]).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line pb-1.5 last:border-0">
              <span>
                {(a.profile as Row)?.full_name}
                <span className="text-ink-soft"> · {(a.profile as Row)?.role}</span>
                {a.is_primary && <Badge tone="gold">home salon</Badge>}
              </span>
              <ActionButton
                action={removeStaffAssignment.bind(null, a.id, salon.id)}
                label="Remove"
                variant="danger"
                confirm={`Remove ${(a.profile as Row)?.full_name} from ${salon.city}? Their upcoming assigned visits here must be reassigned first.`}
              />
            </li>
          ))}
          {(assignments ?? []).length === 0 && (
            <li className="text-ink-soft">No staff assigned yet.</li>
          )}
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <ActionForm action={addStaffAssignment} submitLabel="Assign to this salon">
            <input type="hidden" name="salon_id" value={salon.id} />
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Staff member" htmlFor="assign-staff">
                <select id="assign-staff" name="profile_id" required className={inputClass}>
                  <option value="">Choose…</option>
                  {(staff ?? [])
                    .filter((p) => !assigned.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                    ))}
                </select>
              </Field>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_primary" className="h-5 w-5 accent-brand-600" />
                This is their home salon
              </label>
            </div>
          </ActionForm>
        </div>
      </Card>

      {/* ------------------------------------------------ upcoming visits -- */}
      <Card>
        <p className="font-semibold">Upcoming reservations ({(upcoming ?? []).length})</p>
        {(upcoming ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">None scheduled.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {((upcoming ?? []) as Row[]).map((a) => (
              <li key={a.id}>
                <Link href={`/admin/bookings/${a.id}`}
                  className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-50">
                  <span className="font-medium">
                    {((a.customer as Row)?.profile as Row)?.full_name}
                  </span>
                  <span className="text-ink-soft">{formatDateTime(a.starts_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --------------------- members affected by a pause/close (#34–35) -- */}
      {(released ?? []).length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-semibold">Members to contact — released reservations</p>
          <p className="mt-1 text-sm text-ink-soft">
            These future visits were released when the salon was paused or
            closed. The members kept their visits — reach out and help them
            reserve at any open salon.
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {((released ?? []) as Row[]).map((a) => {
              const cust = a.customer as Row;
              const prof = cust?.profile as Row;
              const wa = cust?.whatsapp_number
                ? String(cust.whatsapp_number).replace(/\D/g, "")
                : null;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{prof?.full_name}</span>
                  <span className="text-ink-soft">
                    was {formatDateTime(a.starts_at)}
                    {wa && (
                      <a className="ml-2 font-semibold text-brand-600 hover:underline"
                        href={`https://wa.me/${wa}`}>
                        WhatsApp
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
