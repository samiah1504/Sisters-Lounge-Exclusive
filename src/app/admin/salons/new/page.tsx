import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth";
import { SalonForm } from "@/components/admin/salon-form";

export const metadata: Metadata = { title: "New Salon" };
export const dynamic = "force-dynamic";

export default async function NewSalonPage() {
  await requireAdmin();
  return (
    <div className="grid max-w-2xl gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">New Salon</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Start it on the waitlist to collect signups from its city, then open
          it from its page when ready — waitlist members join first.
        </p>
      </div>
      <SalonForm salon={null} />
    </div>
  );
}
