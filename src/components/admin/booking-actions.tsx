"use client";

import { useState, useTransition } from "react";
import {
  adminAddInternalNote,
  adminAssignStylist,
  adminCompleteAppointment,
  adminReleaseAppointment,
  adminSetAppointmentStatus,
} from "@/server/actions/admin";
import { buttonClass, inputClass } from "@/components/ui";

export function BookingActions({
  appointmentId,
  status,
  currentStylistId,
  currentStylistName,
  stylists,
  requiredSkill,
}: {
  appointmentId: string;
  status: string;
  currentStylistId: string | null;
  currentStylistName: string | null;
  stylists: Array<{ id: string; name: string }>;
  requiredSkill: string | null;
}) {
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [stylistId, setStylistId] = useState(currentStylistId ?? "");
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; success?: string }>) =>
    startTransition(async () => setMessage(await fn()));

  const live = !["completed", "missed", "cancelled_salon", "cancelled_admin", "expired", "no_longer_eligible"].includes(status);

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="font-semibold">Actions</p>

      {message.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message.error}</p>
      )}
      {message.success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message.success}</p>
      )}

      {live && (
        <>
          <div className="flex flex-wrap gap-2">
            {["pending_confirmation", "pending_addon_payment"].includes(status) && (
              <button className={buttonClass("primary")} disabled={pending}
                onClick={() => run(() => adminSetAppointmentStatus(appointmentId, "confirmed"))}>
                Confirm booking
              </button>
            )}
            {["confirmed", "assigned"].includes(status) && (
              <button className={buttonClass("outline")} disabled={pending}
                onClick={() => run(() => adminSetAppointmentStatus(appointmentId, "arrived"))}>
                Mark arrived
              </button>
            )}
            {["confirmed", "assigned", "arrived"].includes(status) && (
              <button className={buttonClass("outline")} disabled={pending}
                onClick={() => run(() => adminSetAppointmentStatus(appointmentId, "in_service"))}>
                Mark in service
              </button>
            )}
            {["confirmed", "assigned", "arrived", "in_service"].includes(status) && (
              <button className={buttonClass("gold")} disabled={pending}
                onClick={() => run(() => adminCompleteAppointment(appointmentId))}>
                Mark completed (consumes visit)
              </button>
            )}
          </div>

          {/* stylist assignment */}
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="text-sm font-semibold">
              Stylist assignment
              {currentStylistName && (
                <span className="ml-1 font-normal text-ink-soft">— currently {currentStylistName}</span>
              )}
              {requiredSkill && (
                <span className="ml-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-700">
                  requires: {requiredSkill}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <select className={inputClass} value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
                <option value="">Choose a stylist…</option>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                className={buttonClass("primary")}
                disabled={pending || !stylistId}
                onClick={() => run(() => adminAssignStylist(appointmentId, stylistId))}
              >
                {currentStylistId ? "Reassign" : "Assign"}
              </button>
            </div>
            <p className="text-xs text-ink-soft">
              Customers never choose stylists — assignment is internal. Double
              bookings are blocked automatically.
            </p>
          </div>

          {/* release paths */}
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="text-sm font-semibold">Release booking (visit returns to the customer)</p>
            <input
              className={inputClass}
              placeholder="Reason (recommended)"
              value={cancelReason}
              maxLength={300}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass("outline")} disabled={pending}
                onClick={() => run(() => adminReleaseAppointment(appointmentId, "missed", cancelReason))}>
                Mark missed
              </button>
              <button className={buttonClass("danger")} disabled={pending}
                onClick={() => run(() => adminReleaseAppointment(appointmentId, "cancelled_salon", cancelReason))}>
                Cancel (salon)
              </button>
              <button className={buttonClass("danger")} disabled={pending}
                onClick={() => run(() => adminReleaseAppointment(appointmentId, "cancelled_admin", cancelReason))}>
                Cancel (admin)
              </button>
            </div>
          </div>
        </>
      )}

      {/* internal note */}
      <div className="grid gap-2 border-t border-line pt-3">
        <p className="text-sm font-semibold">Add internal note</p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="Visible to staff only"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className={buttonClass("outline")}
            disabled={pending || note.trim().length === 0}
            onClick={() =>
              run(async () => {
                const r = await adminAddInternalNote(appointmentId, note);
                if (!r.error) setNote("");
                return r;
              })
            }
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
