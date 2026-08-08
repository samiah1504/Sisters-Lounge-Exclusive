import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Chat with Us" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "brand" | "amber" | "green" | "gray"> = {
  open: "brand", assigned: "brand", waiting_customer: "amber",
  waiting_salon: "brand", resolved: "green", closed: "gray",
};

export default async function SupportListPage() {
  const session = await requireCustomer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("customer_id", session.customerProfile.id)
    .order("last_message_at", { ascending: false });
  const conversations = (data ?? []) as Row[];

  // WhatsApp fallback uses the member's home salon number (set per salon in
  // Admin → Salons); any open salon's number otherwise. Hidden if none is set.
  const [{ data: salonRows }, { data: subRows }] = await Promise.all([
    supabase
      .from("salons")
      .select("id, whatsapp")
      .eq("status", "open")
      .not("whatsapp", "is", null)
      .order("created_at"),
    supabase
      .from("subscriptions")
      .select("home_salon_id")
      .eq("customer_id", session.customerProfile.id)
      .in("status", ["active", "expiring_soon", "renewal_due"]),
  ]);
  const salons = (salonRows ?? []) as Row[];
  const homeIds = new Set((subRows ?? []).map((s) => s.home_salon_id));
  const waSalon = salons.find((s) => homeIds.has(s.id)) ?? salons[0];
  const waNumber = waSalon ? String(waSalon.whatsapp).replace(/\D/g, "") : null;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Chat with Us
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Get help with your subscription, appointment, extra services or salon
          experience. We reply during salon hours — usually the same day.
        </p>
      </div>

      <ButtonLink href="/app/support/new">Start a new conversation</ButtonLink>

      {conversations.length === 0 ? (
        <EmptyState title="No conversations yet"
          message="Questions about your plan, bookings or products? We're one message away." />
      ) : (
        <div className="grid gap-2.5">
          {conversations.map((c) => {
            const unread = c.last_staff_reply_at &&
              c.last_staff_reply_at > c.customer_last_read_at;
            return (
              <Link key={c.id} href={`/app/support/${c.id}`}>
                <Card className="hover:border-brand-400">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {unread && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-brand-600" />}
                        {c.subject}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {c.topic.replace(/_/g, " ")} · {formatDateTime(c.last_message_at)}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[c.status] ?? "gray"}>
                      {c.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {waNumber && (
        <p className="text-center text-xs text-ink-soft">
          Prefer WhatsApp? Message the salon directly —{" "}
          <a className="font-semibold text-brand-600 underline" target="_blank"
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
              "Assalamu alaikum, I need help with my Sisters Lounge membership",
            )}`}>
            open WhatsApp
          </a>
        </p>
      )}
    </div>
  );
}
