"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn, type AuthFormState } from "@/server/actions/auth";
import { Field, buttonClass, inputClass } from "@/components/ui";

const initial: AuthFormState = {};

function PasswordInput(props: {
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id="password" name="password" required
        type={visible ? "text" : "password"}
        autoComplete={props.autoComplete} minLength={props.minLength}
        className={`${inputClass} pr-11`} />
      <button type="button" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink">
        {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email address" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput autoComplete="current-password" />
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
        <Link href="/plans" className="font-semibold text-brand-600">
          Become a Member
        </Link>
      </p>
    </form>
  );
}
