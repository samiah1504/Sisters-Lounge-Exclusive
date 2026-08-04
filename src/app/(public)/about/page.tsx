import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">About Sisters Lounge</h1>
      <div className="mt-5 grid gap-4 text-[16px] leading-relaxed text-ink">
        <p>
          Sisters Lounge is <strong>Nigeria&apos;s first members-only natural
          hair club</strong>. We started with a simple observation: healthy
          natural hair is not built in one appointment — it is built through
          consistent, professional care, month after month.
        </p>
        <p>
          So we removed everything that gets in the way of consistency. No
          walk-ins. No overcrowded waiting rooms. No guessing whether there
          will be a free chair. Every visit at a Sisters Lounge Salon is
          reserved for a member, which means your stylist&apos;s time — and
          your own — is respected.
        </p>
        <p>
          Membership works like a wellness club: one monthly membership, a
          set number of visits, valid at every Sisters Lounge Salon as we
          open across Nigeria. Parents manage their children&apos;s hair care
          from the same account, and our team gets to know your hair — not
          just your booking reference.
        </p>
        <p>
          We are growing city by city, opening each new salon with its
          waitlist members first in line.
        </p>
      </div>
      <Card className="mt-8 text-center">
        <p className="font-display text-xl text-brand-900">
          Healthy natural hair through consistent professional care.
        </p>
        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/plans">Become a Member</ButtonLink>
          <ButtonLink href="/salons" variant="outline">Find Your Salon</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
