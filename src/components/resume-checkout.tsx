"use client";

import { useActionState } from "react";
import {
  resumeMembershipCheckout,
  type CheckoutState,
} from "@/server/actions/checkout";
import { buttonClass } from "@/components/ui";

const initial: CheckoutState = {};

export function ResumeCheckoutButton() {
  const [state, action, pending] = useActionState(resumeMembershipCheckout, initial);
  return (
    <form action={action} className="grid gap-3">
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Preparing secure payment…" : "Complete Payment"}
      </button>
    </form>
  );
}
