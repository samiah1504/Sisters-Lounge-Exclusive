"use client";

import { useState, useTransition } from "react";
import { updateConversation } from "@/server/actions/operations";
import { inputClass } from "@/components/ui";

export function ConversationControls({
  conversationId,
  status,
  priority,
  assignedStaffId,
  staff,
}: {
  conversationId: string;
  status: string;
  priority: string;
  assignedStaffId: string | null;
  staff: Array<{ id: string; name: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const patch = (p: { status?: string; priority?: string; assigned_staff_id?: string | null }) =>
    startTransition(async () => {
      const r = await updateConversation(conversationId, p);
      setError(r.error ?? null);
    });

  return (
    <div className="grid gap-2 rounded-2xl border border-line bg-white p-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="grid gap-1 text-xs font-semibold text-ink-soft">
          Status
          <select className={inputClass} value={status} disabled={pending}
            onChange={(e) => patch({ status: e.target.value })}>
            {["open", "assigned", "waiting_customer", "waiting_salon", "resolved", "closed"]
              .map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-soft">
          Priority
          <select className={inputClass} value={priority} disabled={pending}
            onChange={(e) => patch({ priority: e.target.value })}>
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-soft">
          Assigned to
          <select className={inputClass} value={assignedStaffId ?? ""} disabled={pending}
            onChange={(e) => patch({ assigned_staff_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
