import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { markConversationRead } from "@/server/actions/operations";
import { ChatThread, type ChatMessage } from "@/components/chat";
import { ConversationControls } from "@/components/admin/conversation-controls";
import { Badge } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffOrAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: convs }, { data: msgs }, { data: replies }, { data: staff }] =
    await Promise.all([
      supabase.from("support_conversations")
        .select("*, customer:customer_profiles(id, profile:profiles(full_name, phone))")
        .eq("id", id).limit(1),
      supabase.from("support_messages").select("*, sender:profiles(full_name)")
        .eq("conversation_id", id).order("created_at"),
      supabase.from("support_saved_replies").select("title, body")
        .eq("is_active", true).order("display_order"),
      supabase.from("profiles").select("id, full_name")
        .in("role", ["staff", "admin"]).eq("is_active", true),
    ]);
  const conv = ((convs ?? []) as Row[])[0];
  if (!conv) notFound();
  await markConversationRead(id, "staff");

  const customer = conv.customer as Row;
  const messages: ChatMessage[] = ((msgs ?? []) as Row[]).map((m) => ({
    id: m.id,
    sender_type: m.sender_type,
    sender_name: (m.sender as { full_name: string })?.full_name ?? "—",
    body: m.body,
    is_internal_note: m.is_internal_note,
    created_at: m.created_at,
  }));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl text-ink">{conv.subject}</h1>
          <p className="text-sm text-ink-soft">
            <Link className="font-semibold text-brand-600 hover:underline"
              href={`/admin/customers/${customer?.id}`}>
              {(customer?.profile as { full_name: string })?.full_name}
            </Link>
            {" · "}{conv.topic.replace(/_/g, " ")}
            {(customer?.profile as { phone: string })?.phone &&
              ` · ${(customer.profile as { phone: string }).phone}`}
          </p>
        </div>
        <Badge tone={["resolved", "closed"].includes(conv.status) ? "gray" : "brand"}>
          {conv.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <ConversationControls
        conversationId={conv.id}
        status={conv.status}
        priority={conv.priority}
        assignedStaffId={conv.assigned_staff_id}
        staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name }))}
      />

      <ChatThread
        conversationId={conv.id}
        messages={messages}
        viewer="staff"
        closed={false}
        savedReplies={replies ?? []}
      />
    </div>
  );
}
