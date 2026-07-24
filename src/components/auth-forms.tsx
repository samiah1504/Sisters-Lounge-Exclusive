"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "@/server/actions/auth";
import { Field, buttonClass, inputClass } from "@/components/ui";

const initial: AuthFormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email address" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-ink-soft">
        New to Sisters Lounge?{" "}
        <Link href="/register" className="font-semibold text-brand-600">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name" htmlFor="full_name">
        <input id="full_name" name="full_name" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Email address" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Creating account…" : "Create my account"}
      </button>
      <p className="text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600">
          Sign in
        </Link>
      </p>
    </form>
  );
}
