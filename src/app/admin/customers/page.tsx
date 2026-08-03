import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireStaffOrAdmin();
  const { q, filter = "all" } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("customer_profiles")
    .select(
      "id, city, account_status, created_at, " +
        "profile:profiles(full_name, email, phone), " +
        "children:children(id), " +
        "subscriptions:subscriptions(id, status), " +
        "tags:customer_tag_assignments(tag:customer_tags(name))",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  let rows = (data ?? []) as Row[];
  if (filter === "active-sub") {
    rows = rows.filter((r) =>
      (r.subscriptions as Array<{ status: string }>).some((s) =>
        ["active", "expiring_soon", "renewal_due"].includes(s.status)));
  } else if (filter === "no-sub") {
    rows = rows.filter((r) =>
      !(r.subscriptions as Array<{ status: string }>).some((s) =>
        ["active", "expiring_soon", "renewal_due"].includes(s.status)));
  } else if (filter === "archived") {
    rows = rows.filter((r) => r.account_status === "archived");
  }
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const p = r.profile as unknown as { full_name: string; email: string | null; phone: string | null };
      return (
        p?.full_name?.toLowerCase().includes(needle) ||
        p?.email?.toLowerCase().includes(needle) ||
        p?.phone?.includes(q)
      );
    });
  }

  return (
    <div className="grid gap-4">
      <h1 className="heading-rule font-display text-2xl text-ink">Members</h1>

      <form className="flex gap-2" action="/admin/customers" method="get">
        <input
          type="search" name="q" defaultValue={q ?? ""}
          placeholder="Search name, email or phone…"
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] outline-none focus:border-brand-600"
        />
        <button className="rounded-xl bg-brand-600 px-4 font-semibold text-white">Search</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["active-sub", "Active subscription"],
          ["no-sub", "No active subscription"],
          ["archived", "Archived"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/customers?filter=${key}${q ? `&q=${q}` : ""}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${filter === key ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No customers" message="Nothing matches this search." />
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r) => {
            const p = r.profile as unknown as { full_name: string; email: string | null; phone: string | null };
            const hasActive = (r.subscriptions as Array<{ status: string }>).some((s) =>
              ["active", "expiring_soon", "renewal_due"].includes(s.status));
            const tags = (r.tags as Array<{ tag: { name: string } }>).map((t) => t.tag?.name).filter(Boolean);
            return (
              <Link key={r.id} href={`/admin/customers/${r.id}`}>
                <Card className="flex items-center justify-between gap-3 hover:border-brand-400">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p?.full_name || "—"}</p>
                    <p className="truncate text-sm text-ink-soft">
                      {p?.email} · {p?.phone ?? "no phone"} ·{" "}
                      {(r.children as Array<unknown>).length} child
                      {(r.children as Array<unknown>).length !== 1 ? "ren" : ""}
                    </p>
                    {tags.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span key={t} className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                            {t}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {r.account_status === "archived" ? (
                      <Badge tone="gray">Archived</Badge>
                    ) : hasActive ? (
                      <Badge tone="green">Subscribed</Badge>
                    ) : (
                      <Badge tone="amber">No plan</Badge>
                    )}
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
