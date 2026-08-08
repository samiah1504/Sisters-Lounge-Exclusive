"use client";

import { useState, useTransition } from "react";
import {
  cancelAutoRenewal,
  openCardUpdateLink,
  type ActionState,
} from "@/server/actions/billing";
import { buttonClass } from "@/components/ui";

/** Billing controls on Manage Membership (payments spec §10). */
export function BillingControls({
  subscriptionId,
  cancelled,
}: {
  subscriptionId: string;
  cancelled: boolean;
}) {
  const [state, setState] = useState<ActionState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => setState(await fn()));

  return (
    <div className="grid gap-2.5">
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending}
          onClick={() => run(() => openCardUpdateLink(subscriptionId))}
          className={buttonClass("outline")}>
          Update payment method
        </button>
        {!cancelled && !confirming && (
          <button type="button" disabled={pending}
            onClick={() => setConfirming(true)}
            className={buttonClass("ghost")}>
            Cancel auto-renewal
          </button>
        )}
      </div>
      {confirming && !cancelled && (
        <div className="rounded-xl border border-line bg-white p-3">
          <p className="text-sm text-ink">
            Stop automatic renewal? Your current cycle and its visits stay
            exactly as they are — you simply won&apos;t be charged again.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await cancelAutoRenewal(subscriptionId);
                  setConfirming(false);
                  return result;
                })
              }
              className={buttonClass("primary")}>
              {pending ? "Stopping…" : "Yes, stop auto-renewal"}
            </button>
            <button type="button" disabled={pending}
              onClick={() => setConfirming(false)}
              className={buttonClass("ghost")}>
              Keep my membership renewing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
