"use client";

import { useState, useTransition } from "react";
import { expenseTransition } from "@/server/actions/operations";
import { buttonClass } from "@/components/ui";

export function ExpenseActions({ expenseId, status }: { expenseId: string; status: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const run = (action: "submit" | "approve" | "reject" | "mark_paid" | "void", reason = "") =>
    startTransition(async () => setMsg(await expenseTransition(expenseId, action, reason)));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <button className={buttonClass("primary")} disabled={pending}
            onClick={() => run("submit")}>Submit for approval</button>
        )}
        {status === "pending_approval" && (
          <>
            <button className={buttonClass("primary")} disabled={pending}
              onClick={() => run("approve")}>Approve</button>
            <button className={buttonClass("danger")} disabled={pending}
              onClick={() => {
                const reason = window.prompt("Reason for rejection?") ?? "";
                if (reason) run("reject", reason);
              }}>Reject</button>
          </>
        )}
        {status === "approved" && (
          <button className={buttonClass("gold")} disabled={pending}
            onClick={() => run("mark_paid")}>Mark paid</button>
        )}
        {["pending_approval", "approved", "paid", "rejected"].includes(status) && (
          <button className={buttonClass("outline")} disabled={pending}
            onClick={() => {
              const reason = window.prompt("Void reason (required)?") ?? "";
              if (reason.trim()) run("void", reason);
            }}>Void</button>
        )}
      </div>
      {msg.error && <p className="text-sm text-red-700">{msg.error}</p>}
      {msg.success && <p className="text-sm text-emerald-700">{msg.success}</p>}
    </div>
  );
}
