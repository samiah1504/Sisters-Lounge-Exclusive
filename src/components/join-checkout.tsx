"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  startMembershipCheckout,
  type CheckoutState,
} from "@/server/actions/checkout";
import { Field, buttonClass, inputClass } from "@/components/ui";

/**
 * Checkout form (payments spec §4, §10): account creation feels like part of
 * the membership purchase, the home salon is chosen here, and the recurring
 * nature of billing is stated plainly before the member authorizes payment.
 */

interface SalonOption {
  id: string;
  name: string;
  city: string;
}

const initial: CheckoutState = {};

export function JoinCheckout({
  planSlug,
  salons,
  signedIn,
  memberName,
}: {
  planSlug: string;
  salons: SalonOption[];
  signedIn: boolean;
  memberName?: string;
}) {
  const [state, action, pending] = useActionState(startMembershipCheckout, initial);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="plan_slug" value={planSlug} />

      {signedIn ? (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink">
          Continuing as <strong>{memberName}</strong> — your membership will be
          added to this account.
        </p>
      ) : (
        <>
          <h2 className="font-display text-lg text-ink">Create your account</h2>
          <Field label="Full name" htmlFor="full_name">
            <input id="full_name" name="full_name" autoComplete="name" required
              className={inputClass} />
          </Field>
          <Field label="Email address" htmlFor="email">
            <input id="email" name="email" type="email" autoComplete="email" required
              className={inputClass} />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <input id="phone" name="phone" type="tel" autoComplete="tel" required
              className={inputClass} />
          </Field>
          <Field label="WhatsApp number" htmlFor="whatsapp_number"
            hint="Leave empty to use your phone number.">
            <input id="whatsapp_number" name="whatsapp_number" type="tel"
              className={inputClass} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <div className="relative">
              <input id="password" name="password" required minLength={8}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password" className={`${inputClass} pr-11`} />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink">
                {showPassword
                  ? <EyeOff className="h-5 w-5" aria-hidden />
                  : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </div>
          </Field>
          <p className="text-sm text-ink-soft">
            Already a member?{" "}
            <Link href={`/login?next=/join/${planSlug}`}
              className="font-semibold text-brand-600">
              Sign in to continue
            </Link>
          </p>
        </>
      )}

      <h2 className="font-display text-lg text-ink">Choose your home salon</h2>
      <p className="-mt-2 text-sm text-ink-soft">
        Your home salon is where we expect you most — your membership still
        works at every Sisters Lounge Salon nationwide.
      </p>
      <div className="grid gap-2">
        {salons.map((s, i) => (
          <label key={s.id}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="salon_id" value={s.id} required
              defaultChecked={i === 0} className="accent-brand-600" />
            <span>
              <span className="block font-semibold">{s.name}</span>
              <span className="block text-sm text-ink-soft">{s.city}</span>
            </span>
          </label>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="rounded-xl bg-gold-50 px-3 py-2.5 text-sm text-ink">
        <strong>Automatic renewal:</strong> your membership renews automatically
        each billing cycle until you cancel it. You can cancel auto-renewal any
        time from your dashboard — your current cycle always runs to the end.
      </div>

      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Preparing secure payment…" : "Continue to Payment"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        Payment is processed securely by Paystack. We never see or store your
        card details.
      </p>
    </form>
  );
}
