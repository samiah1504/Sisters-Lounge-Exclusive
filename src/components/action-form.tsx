"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Generic wrapper for admin forms: renders server-component children as the
 * fields, wires a bound server action, disables the submit button while
 * saving, shows errors inline and successes as an auto-dismissing toast.
 * With `warnUnsaved`, leaving the page with unsaved edits asks first.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-4",
  warnUnsaved = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  warnUnsaved?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Surface success as a toast and clear the dirty flag (async callbacks
  // only — no synchronous setState inside the effect body).
  useEffect(() => {
    if (!state.success) return;
    const show = requestAnimationFrame(() => {
      setToast(state.success ?? null);
      setDirty(false);
    });
    const hide = setTimeout(() => setToast(null), 4000);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
    };
  }, [state]);

  useEffect(() => {
    if (!warnUnsaved || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [warnUnsaved, dirty]);

  return (
    <form
      action={formAction}
      className={className}
      onInput={() => warnUnsaved && setDirty(true)}
    >
      {children}
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "justify-self-start")}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {warnUnsaved && dirty && !pending && (
        <p className="text-xs text-amber-700">You have unsaved changes.</p>
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          ✓ {toast}
        </div>
      )}
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
