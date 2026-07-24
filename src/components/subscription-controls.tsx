"use client";

import { useState, useTransition } from "react";
import {
  cancelPendingSelection,
  setRenewalOptOut,
} from "@/server/actions/customer";
import { buttonClass } from "@/components/ui";

export function CancelSelectionButton({ selectionId }: { selectionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className={buttonClass("danger")}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await cancelPendingSelection(selectionId);
            setError(r.error ?? null);
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel selection"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function RenewalOptOutToggle({
  subscriptionId,
  optedOut,
}: {
  subscriptionId: string;
  optedOut: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">
          Opt out of next renewal
          {optedOut && <span className="ml-2 text-xs font-normal text-amber-700">(opted out)</span>}
        </span>
        <input
          type="checkbox"
          className="h-6 w-6 accent-brand-600"
          checked={optedOut}
          disabled={pending}
          onChange={(e) =>
            startTransition(async () => {
              const r = await setRenewalOptOut(subscriptionId, e.target.checked);
              setError(r.error ?? null);
            })
          }
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
