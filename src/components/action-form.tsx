"use client";

import { useActionState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Generic wrapper for admin forms: renders server-component children as the
 * fields, wires a bound server action and shows validation feedback.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-4",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "justify-self-start")}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** One-click action button with inline error display. */
export function ActionButton({
  action,
  label,
  variant = "outline",
  confirm,
}: {
  action: () => Promise<FormState | void>;
  label: string;
  variant?: "primary" | "ghost" | "outline" | "danger" | "gold";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<FormState> => {
      const r = await action();
      return r ?? {};
    },
    {} as FormState,
  );
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      <button type="submit" disabled={pending} className={buttonClass(variant)}>
        {pending ? "…" : label}
      </button>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state.success && <p className="text-xs text-emerald-700">{state.success}</p>}
    </form>
  );
}
