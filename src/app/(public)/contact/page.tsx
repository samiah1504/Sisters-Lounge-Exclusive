import type { Metadata } from "next";
import { getPublicSalons } from "@/server/catalogue";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const salons = await getPublicSalons();
  const open = salons.filter((s) => s.status === "open");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">Contact Us</h1>
      <p className="mt-3 text-ink-soft">
        Members: the fastest way to reach us is <strong>Chat with Us</strong>{" "}
        inside your member dashboard — the team replies during salon hours.
        Everyone else, we&apos;re happy to hear from you below.
      </p>

      <div className="mt-6 grid gap-4">
        {open.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg text-brand-900">{s.name}</p>
                <p className="text-sm text-ink-soft">
                  {s.address} · {s.city}, {s.state}
                </p>
              </div>
              <Badge tone="green">Open</Badge>
            </div>
            <p className="mt-2 flex flex-wrap gap-4 text-sm font-semibold">
              {s.phone && (
                <a className="text-brand-600 hover:underline" href={`tel:${s.phone}`}>
                  {s.phone}
                </a>
              )}
              {s.whatsapp && (
                <a className="text-brand-600 hover:underline"
                  href={`https://wa.me/${String(s.whatsapp).replace(/\D/g, "")}`}>
                  WhatsApp us
                </a>
              )}
            </p>
          </Card>
        ))}
        {open.length === 0 && (
          <Card>
            <p className="text-sm text-ink-soft">
              Contact details are being prepared — check back shortly.
            </p>
          </Card>
        )}
      </div>

      <Card className="mt-6 text-center">
        <p className="font-semibold">Not in one of our cities yet?</p>
        <p className="mt-1 text-sm text-ink-soft">
          Join your city&apos;s waitlist — that is exactly how we pick where
          to open next.
        </p>
        <div className="mt-3">
          <ButtonLink href="/salons" variant="outline">View Salons &amp; Waitlists</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
