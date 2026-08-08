"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkMembershipActivated } from "@/server/actions/checkout";
import { ButtonLink } from "@/components/ui";

/**
 * Post-payment holding screen (payments spec §9): the browser only *reads*
 * activation state — the webhook is the sole activator. Polls until the
 * membership shows active, then enters the member experience.
 */
export function PaymentConfirming() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped.current) return;
      try {
        const status = await checkMembershipActivated();
        if (status === "active") {
          router.replace("/app?welcome=1");
          return;
        }
        if (status === "unauthenticated") {
          router.replace("/login?next=/app");
          return;
        }
      } catch {
        // transient network error — keep polling
      }
      if (Date.now() - started > 90_000) setSlow(true);
      timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="grid gap-4 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"
        role="status" aria-label="Confirming payment" />
      <h1 className="font-display text-2xl text-ink">Confirming your payment…</h1>
      <p className="mx-auto max-w-md text-sm text-ink-soft">
        Paystack is confirming your payment. Your membership activates
        automatically the moment it is confirmed — this usually takes a few
        seconds.
      </p>
      {slow && (
        <div className="mx-auto max-w-md rounded-xl bg-gold-50 px-4 py-3 text-sm text-ink">
          This is taking longer than usual. If you were charged, your
          membership will still activate automatically — check your dashboard
          in a few minutes or chat with us and we will sort it out.
          <div className="mt-3">
            <ButtonLink href="/app" variant="outline">Go to my dashboard</ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
