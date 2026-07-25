"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postAppointmentConsumption } from "@/server/actions/operations";
import { needsVarianceReason } from "@/lib/operations";
import { inputClass } from "@/components/ui";

interface Line {
  item_id: string;
  name: string;
  unit: string;
  planned: number;
  actual: string; // input value
  reason: string;
}

export function ConsumptionPanel({
  appointmentId,
  prefill,
  available,
}: {
  appointmentId: string;
  prefill: Array<{ item_id: string; name: string; unit: string; planned: number }>;
  available: Array<{ id: string; name: string; unit: string; quantity_available: number }>;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    prefill.map((p) => ({ ...p, actual: String(p.planned), reason: "" })),
  );
  const [addId, setAddId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, p: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

  const addLine = (id: string) => {
    const item = available.find((a) => a.id === id);
    if (!item || lines.some((l) => l.item_id === id)) return;
    setLines((ls) => [
      ...ls,
      { item_id: id, name: item.name, unit: item.unit, planned: 0, actual: "", reason: "" },
    ]);
  };

  const submit = () => {
    setError(null);
    const items = lines
      .map((l) => ({
        item_id: l.item_id,
        planned: l.planned,
        actual: Number(l.actual || 0),
        reason: l.reason.trim() || null,
      }))
      .filter((l) => l.actual > 0 || l.planned > 0);
    if (items.length === 0) {
      setError("Enter at least one quantity used.");
      return;
    }
    for (const l of items) {
      if (needsVarianceReason(l.planned, l.actual) && !l.reason) {
        setError("Add a short reason for lines that differ a lot from the plan.");
        return;
      }
    }
    if (!window.confirm("Record this inventory usage? Stock will be deducted and this cannot be edited.")) return;
    startTransition(async () => {
      const r = await postAppointmentConsumption(appointmentId, items);
      if (r.error) {
        setError(r.error);
      } else {
        setDone(true);
        router.refresh();
      }
    });
  };

  if (done) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
        Inventory usage recorded — stock has been deducted.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {lines.length === 0 && (
        <p className="text-sm text-ink-soft">
          No consumption template for this service — add the items used below.
        </p>
      )}
      {lines.map((l, i) => {
        const needReason = needsVarianceReason(l.planned, Number(l.actual || 0));
        return (
          <div key={l.item_id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.name}</p>
                <p className="text-xs text-ink-soft">
                  Planned: {l.planned} {l.unit}
                </p>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-ink-soft">
                Used ({l.unit})
                <input
                  type="number" min={0} step="any" value={l.actual}
                  onChange={(e) => patch(i, { actual: e.target.value })}
                  className={`${inputClass} w-28`}
                />
              </label>
            </div>
            {needReason && (
              <label className="mt-2 grid gap-1 text-xs font-semibold text-amber-700">
                Why does this differ from the plan?
                <input
                  value={l.reason}
                  onChange={(e) => patch(i, { reason: e.target.value })}
                  placeholder="e.g. very long hair needed extra product"
                  className={inputClass}
                />
              </label>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={addId}
          onChange={(e) => {
            addLine(e.target.value);
            setAddId("");
          }}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">+ Add another item…</option>
          {available
            .filter((a) => !lines.some((l) => l.item_id === a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.quantity_available} {a.unit} in stock)
              </option>
            ))}
        </select>
        <button
          onClick={submit}
          disabled={pending}
          className="ml-auto rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record usage"}
        </button>
      </div>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <p className="text-xs text-ink-soft">
        Recording deducts stock once and cannot be edited afterwards — corrections
        go through a stock adjustment with a reason.
      </p>
    </div>
  );
}
