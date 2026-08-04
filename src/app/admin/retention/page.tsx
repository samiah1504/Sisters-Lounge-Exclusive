import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { visitSummary } from "@/lib/booking-rules";
import { formatDate } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";
import type { VisitEntitlement } from "@/lib/types";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Retention" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "no-booking", label: "No booking this cycle" },
  { key: "unused-visits", label: "Unused visits" },
  { key: "expiring", label: "Expiring soon" },
  { key: "expired", label: "Expired" },
  { key: "missed", label: "Missed appointments" },
  { key: "pending-selection", label: "Pending selections" },
  { key: "no-upcoming", label: "No upcoming visit" },
];

interface RetentionRow {
  customerId: string;
  name: string;
  detail: string;
}

export default async function AdminRetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireStaffOrAdmin();
  const { view = "no-booking" } = await searchParams;
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const rows: RetentionRow[] = [];

  if (["no-booking", "unused-visits", "expiring", "no-upcoming"].includes(view)) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select(
        "id, status, customer:customer_profiles(id, profile:profiles(full_name)), " +
          "plan:subscription_plans(name), child:children(full_name), " +
          "cycles:subscription_cycles(id, status, starts_on, ends_on, " +
          "entitlements:visit_entitlements(status))",
      )
      .in("status", ["active", "expiring_soon", "renewal_due"]);

    const { data: liveAppts } = await supabase
      .from("appointments")
      .select("subscription_id, cycle_id, starts_at, status, entitlement_at_risk")
      .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned", "arrived", "in_service", "completed"]);

    for (const s of (subs ?? []) as Row[]) {
      const cust = s.customer as unknown as { id: string; profile: { full_name: string } };
      const cycle = (s.cycles as Array<{
        id: string; status: string; starts_on: string; ends_on: string;
        entitlements: VisitEntitlement[];
      }>).find((c) => c.status === "active");
      if (!cycle) continue;
      const summary = visitSummary(cycle.entitlements);
      const cycleAppts = (liveAppts ?? []).filter((a) => a.cycle_id === cycle.id);
      const upcoming = (liveAppts ?? []).filter(
        (a) => a.subscription_id === s.id && new Date(a.starts_at) > new Date() && a.status !== "completed",
      );
      const planName = (s.plan as { name: string })?.name;
      const who = s.child ? ` (${(s.child as { full_name: string }).full_name})` : "";
      const daysLeft = Math.ceil(
        (new Date(cycle.ends_on).getTime() - new Date(today).getTime()) / 86_400_000,
      );

      if (view === "no-booking" && cycleAppts.length === 0) {
        rows.push({
          customerId: cust.id, name: cust.profile.full_name,
          detail: `${planName}${who} — no booking this cycle, ${summary.remaining} visit(s) unused, expires ${formatDate(cycle.ends_on)}`,
        });
      }
      if (view === "unused-visits" && summary.remaining > 0) {
        // v3 §5.6: a flagged reservation means the remaining visits may no
        // longer fit before cycle end — nudge these members first.
        const atRisk = cycleAppts.some(
          (a) => a.entitlement_at_risk && a.status !== "completed");
        rows.push({
          customerId: cust.id, name: cust.profile.full_name,
          detail: `${planName}${who} — ${summary.remaining} unused visit(s), ${daysLeft} day(s) left in cycle${atRisk ? " · ⚠ visits at risk (reserved too late to fit the rest)" : ""}`,
        });
      }
      if (view === "expiring" && daysLeft <= 7) {
        rows.push({
          customerId: cust.id, name: cust.profile.full_name,
          detail: `${planName}${who} — cycle expires ${formatDate(cycle.ends_on)} (${daysLeft} day(s))`,
        });
      }
      if (view === "no-upcoming" && upcoming.length === 0) {
        rows.push({
          customerId: cust.id, name: cust.profile.full_name,
          detail: `${planName}${who} — no upcoming appointment scheduled`,
        });
      }
    }
  }

  if (view === "expired") {
    const { data } = await supabase
      .from("subscriptions")
      .select("id, updated_at, customer:customer_profiles(id, profile:profiles(full_name)), plan:subscription_plans(name)")
      .eq("status", "expired")
      .order("updated_at", { ascending: false })
      .limit(100);
    for (const s of (data ?? []) as Row[]) {
      const cust = s.customer as unknown as { id: string; profile: { full_name: string } };
      rows.push({
        customerId: cust.id, name: cust.profile.full_name,
        detail: `${(s.plan as { name: string })?.name} — expired ${formatDate(s.updated_at)}`,
      });
    }
  }

  if (view === "missed") {
    const { data } = await supabase
      .from("appointments")
      .select("id, starts_at, customer:customer_profiles(id, profile:profiles(full_name)), service:services(name)")
      .eq("status", "missed")
      .order("starts_at", { ascending: false })
      .limit(100);
    for (const a of (data ?? []) as Row[]) {
      const cust = a.customer as unknown as { id: string; profile: { full_name: string } };
      rows.push({
        customerId: cust.id, name: cust.profile.full_name,
        detail: `Missed ${(a.service as unknown as { name: string })?.name} on ${formatDate(a.starts_at)} — visit was released`,
      });
    }
  }

  if (view === "pending-selection") {
    const { data } = await supabase
      .from("pending_plan_selections")
      .select("id, created_at, customer:customer_profiles(id, profile:profiles(full_name)), plan:subscription_plans(name)")
      .eq("status", "pending_payment")
      .order("created_at", { ascending: false });
    for (const s of (data ?? []) as Row[]) {
      const cust = s.customer as unknown as { id: string; profile: { full_name: string } };
      rows.push({
        customerId: cust.id, name: cust.profile.full_name,
        detail: `Selected ${(s.plan as { name: string })?.name} on ${formatDate(s.created_at)} — awaiting payment phase or manual activation`,
      });
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Retention</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Customers worth a follow-up. In-app prompts are generated
          automatically; WhatsApp/email delivery arrives in a later phase.
        </p>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/admin/retention?view=${v.key}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${view === v.key ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing here" message="No customers match this view right now — that's a good sign." />
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r, i) => (
            <Link key={`${r.customerId}-${i}`} href={`/admin/customers/${r.customerId}`}>
              <Card className="hover:border-brand-400">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-ink-soft">{r.detail}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
