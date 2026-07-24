"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { selectPlan } from "@/server/actions/customer";
import { Field, buttonClass, inputClass } from "@/components/ui";

export function SelectPlanForm({
  planId,
  forChildren,
  childOptions,
}: {
  planId: string;
  forChildren: boolean;
  childOptions: Array<{ id: string; name: string }>;
}) {
  const [childId, setChildId] = useState<string>(childOptions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (forChildren && childOptions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-brand-50 p-5 text-center">
        <p className="text-sm text-ink-soft">
          This plan is for children — add a child profile first.
        </p>
        <Link
          href="/app/children/new"
          className={buttonClass("primary", "mt-3")}
        >
          Add a child
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {forChildren && (
        <Field label="Who is this plan for?" htmlFor="child">
          <select
            id="child"
            className={inputClass}
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {childOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        className={buttonClass("primary")}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await selectPlan(planId, forChildren ? childId : null);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Saving selection…" : "Confirm plan selection"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        No payment is taken now. You can change or cancel this selection any
        time before activation.
      </p>
    </div>
  );
}
