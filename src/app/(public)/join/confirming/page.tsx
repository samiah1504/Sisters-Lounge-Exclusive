import type { Metadata } from "next";
import { PaymentConfirming } from "@/components/payment-confirming";

export const metadata: Metadata = { title: "Confirming your payment" };
export const dynamic = "force-dynamic";

/** Paystack redirects here after checkout. Display-only (payments spec §9). */
export default function ConfirmingPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <PaymentConfirming />
    </div>
  );
}
