import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Support Inbox" };
export const dynamic = "force-dynamic";

const PRIORITY_TONE: Record<string, "gray" | "brand" | "amber" | "red"> = {
  low: "gray", normal: "brand", high: "amber", urgent: "red",
};

const FILTERS = [
  ["active", "Active"], ["unread", "Unread"], ["urgent", "Urgent"],
  ["waiting_salon", "Waiting for salon"], ["unassigned", "Unassigned"],
  ["resolved", "Resolved"], ["all", "All"],
];

export default async function SupportInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  await requireStaffOrAdmin();
  const { filter = "active", q } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_conversations")
    .select("*, customer:customer_profiles(id, profile:profiles(full_name)), assignee:profiles!support_conversations_assigned_staff_id_fkey(full_name)")
    .order("last_message_at", { ascending: false })
    .limit(100);
  let rows = (data ?? []) as Row[];

  switch (filter) {
    case "active":
      rows = rows.filter((c) => !["resolved", "closed"].includes(c.status)); break;
    case "unread":
      rows = rows.filter((c) =>
        c.last_customer_message_at &&
        (!c.staff_last_read_at || c.last_customer_message_at > c.staff_last_read_at)); break;
    case "urgent":
      rows = rows.filter((c) => c.priority === "urgent" && !["resolved", "closed"].includes(c.status)); break;
    case "waiting_salon":
      rows = rows.filter((c) => ["open", "waiting_salon"].includes(c.status)); break;
    case "unassigned":
      rows = rows.filter((c) => !c.assigned_staff_id && !["resolved", "closed"].includes(c.status)); break;
    case "resolved":
      rows = rows.filter((c) => ["resolved", "closed"].includes(c.status)); break;
  }
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((c) =>
      ((c.customer as Row)?.profile as { full_name: string })?.full_name?.toLowerCase().includes(needle) ||
      c.subject.toLowerCase().includes(needle));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Support Inbox</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Customer conversations with the Salon Manager.
          </p>
        </div>
        <ButtonLink href="/admin/support/replies" variant="outline">Saved replies</ButtonLink>
      </div>

      <form className="flex gap-2" action="/admin/support" method="get">
        <input type="hidden" name="filter" value={filter} />
        <input type="search" name="q" defaultValue={q ?? ""} placeholder="Search customer or subject…"
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] outline-none focus:border-brand-600" />
        <button className="rounded-xl bg-brand-600 px-4 font-semibold text-white">Search</button>
      </form>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/admin/support?filter=${k}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${filter === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Inbox zero" message="No conversations match this filter." />
      ) : (
        <div className="grid gap-2.5">
          {rows.map((c) => {
            const unread = c.last_customer_message_at &&
              (!c.staff_last_read_at || c.last_customer_message_at > c.staff_last_read_at);
            return (
              <Link key={c.id} href={`/admin/support/${c.id}`}>
                <Card className="hover:border-brand-400">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {unread && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-brand-600" />}
                        {((c.customer as Row)?.profile as { full_name: string })?.full_name} — {c.subject}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {c.topic.replace(/_/g, " ")} · {formatDateTime(c.last_message_at)}
                        {c.assignee && ` · assigned to ${(c.assignee as { full_name: string }).full_name}`}
                      </p>
                    </div>
                    <span className="flex gap-1.5">
                      <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>
                      <Badge tone={["resolved", "closed"].includes(c.status) ? "gray" : "amber"}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
