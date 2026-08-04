"use client";

import { useState, useTransition } from "react";
import {
  closeSalon,
  launchSalon,
  pauseSalon,
  reopenSalon,
} from "@/server/actions/salons";
import { buttonClass } from "@/components/ui";

/** Status actions for one salon (v3 §7.3, #34–35). Pause/close prompt for a
 *  reason and release future reservations at no member cost. */
export function SalonLifecycle({ salonId, status }: { salonId: string; status: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; success?: string }>) =>
    startTransition(async () => setMsg(await fn()));

  const withReason = (
    label: string,
    fn: (id: string, reason: string) => Promise<{ error?: string; success?: string }>,
  ) => {
    const reason = window.prompt(`${label} — reason (members may be contacted with this):`);
    if (reason === null) return;
    run(() => fn(salonId, reason));
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {["planned", "waitlist"].includes(status) && (
          <button
            disabled={pending}
            className={buttonClass("primary")}
            onClick={() => {
              if (window.confirm("Open this salon? Members will immediately be able to reserve visits here."))
                run(() => launchSalon(salonId));
            }}
          >
            Open this salon
          </button>
        )}
        {status === "open" && (
          <button
            disabled={pending}
            className={buttonClass("outline")}
            onClick={() => withReason("Pause salon", pauseSalon)}
          >
            Pause salon
          </button>
        )}
        {status === "paused" && (
          <button
            disabled={pending}
            className={buttonClass("primary")}
            onClick={() => run(() => reopenSalon(salonId))}
          >
            Reopen salon
          </button>
        )}
        {["open", "paused"].includes(status) && (
          <button
            disabled={pending}
            className={buttonClass("danger")}
            onClick={() => {
              if (window.confirm("Close this salon permanently? All future reservations here will be released."))
                withReason("Close salon", closeSalon);
            }}
          >
            Close salon
          </button>
        )}
      </div>
      {msg?.error && <p className="text-sm font-medium text-red-700">{msg.error}</p>}
      {msg?.success && <p className="text-sm font-medium text-emerald-700">{msg.success}</p>}
      {["open", "paused"].includes(status) && (
        <p className="text-xs text-ink-soft">
          Pausing or closing releases every future reservation at this salon —
          members keep their visits and are prompted to reserve at any open
          salon (v3 #34–35).
        </p>
      )}
    </div>
  );
}
