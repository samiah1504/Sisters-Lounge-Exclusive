import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import {
  customerResolveConversation,
  markConversationRead,
} from "@/server/actions/operations";
import { ActionButton } from "@/components/action-form";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { Badge } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function CustomerConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCustomer();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: convs }, { data: msgs }] = await Promise.all([
    supabase.from("support_conversations").select("*")
      .eq("id", id).eq("customer_id", session.customerProfile.id).limit(1),
    supabase.from("support_messages")
      .select("*, sender:profiles(full_name)")
      .eq("conversation_id", id).order("created_at"),
  ]);
  const conv = ((convs ?? []) as Row[])[0];
  if (!conv) notFound();
  await markConversationRead(id, "customer");

  const messages: ChatMessage[] = ((msgs ?? []) as Row[]).map((m) => ({
    id: m.id,
    sender_type: m.sender_type,
    sender_name: m.sender_type === "staff"
      ? "Salon Manager"
      : (m.sender as { full_name: string })?.full_name ?? "You",
    body: m.body,
    is_internal_note: m.is_internal_note,
    created_at: m.created_at,
  }));

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl text-ink">{conv.subject}</h1>
          <p className="text-sm text-ink-soft">{conv.topic.replace(/_/g, " ")}</p>
        </div>
        <Badge tone={conv.status === "resolved" ? "green" : conv.status === "closed" ? "gray" : "brand"}>
          {conv.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <ChatThread
        conversationId={conv.id}
        messages={messages}
        viewer="customer"
        closed={conv.status === "closed"}
      />

      {!["resolved", "closed"].includes(conv.status) && (
        <ActionButton
          action={customerResolveConversation.bind(null, conv.id, false)}
          label="Mark as resolved" variant="outline" />
      )}
      {conv.status === "resolved" && (
        <ActionButton
          action={customerResolveConversation.bind(null, conv.id, true)}
          label="Reopen — I still need help" variant="outline" />
      )}
    </div>
  );
}
