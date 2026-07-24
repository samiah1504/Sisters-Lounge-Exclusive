"use client";

import { useState, useTransition } from "react";
import { setChildArchived } from "@/server/actions/customer";
import { buttonClass } from "@/components/ui";

export function ChildArchiveButton({
  childId,
  archived,
}: {
  childId: string;
  archived: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const act = () =>
    startTransition(async () => {
      const result = await setChildArchived(childId, !archived);
      setError(result.error ?? null);
      setConfirming(false);
    });

  if (!archived && !confirming) {
    return (
      <div>
        <button className={buttonClass("danger")} onClick={() => setConfirming(true)}>
          Archive profile
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }
  if (!archived) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
        <p className="text-sm">
          Archive this child&apos;s profile? Their history is kept and you can
          restore them later.
        </p>
        <div className="mt-3 flex gap-2">
          <button className={buttonClass("danger")} disabled={pending} onClick={act}>
            {pending ? "Archiving…" : "Yes, archive"}
          </button>
          <button className={buttonClass("outline")} onClick={() => setConfirming(false)}>
            Keep active
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }
  return (
    <div>
      <button className={buttonClass("outline")} disabled={pending} onClick={act}>
        {pending ? "Restoring…" : "Restore profile"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
