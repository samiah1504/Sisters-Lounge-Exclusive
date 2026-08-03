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

      <p className="text-center text-xs text-ink-soft">
        Prefer WhatsApp? Message the salon directly —{" "}
        <a className="font-semibold text-brand-600 underline" target="_blank"
          href="https://wa.me/2348000000000?text=Assalamu%20alaikum%2C%20I%20need%20help%20with%20my%20Sisters%20Lounge%20subscription">
          open WhatsApp
        </a>{" "}
        (update this number in the code before launch).
      </p>
    </div>
  );
}
