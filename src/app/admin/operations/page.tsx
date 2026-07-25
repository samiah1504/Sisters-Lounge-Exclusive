import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { formatNaira } from "@/lib/format";
import {
  expiryStatus,
  stockLevel,
  utilizationPercent,
  weeklySlotCapacity,
} from "@/lib/operations";
import { Badge, Card, Meter } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Operations Dashboard" };
export const dynamic = "force-dynamic";

function Section({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-600">
          {title}
        </p>
        <Link href={href} className="text-sm font-semibold text-brand-600 hover:underline">
          {linkLabel} →
        </Link>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: "red" | "amber" }) {
  return (
    <div>
      <p className={`font-display text-2xl font-bold ${
        tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-brand-900"}`}>
        {value}
      </p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}

export default async function OperationsDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { data: subs }, { data: ents }, { data: sched }, { data: hours },
    { data: capSettings }, { data: invSettings }, { data: items },
    { data: expenses }, { data: intents }, { data: convs },
    { count: pendingSelections },
  ] = await Promise.all([
    supabase.from("subscriptions").select("id, status, plan_id")
      .in("status", ["active", "expiring_soon", "renewal_due"]),
    supabase.from("visit_entitlements")
      .select("status, cycle:subscription_cycles!inner(status)")
      .eq("subscription_cycles.status", "active"),
    supabase.from("scheduling_settings").select("*").limit(1),
    supabase.from("business_hours").select("*"),
    supabase.from("subscription_capacity_settings").select("*").limit(1),
    supabase.from("inventory_settings").select("*").limit(1),
    supabase.from("inventory_items")
      .select("quantity_available, reorder_level, expiry_date, is_active")
      .eq("is_active", true),
    supabase.from("expenses")
      .select("status, amount_kobo, expense_date")
      .gte("expense_date", monthStart),
    supabase.from("pending_payment_intents").select("amount_kobo, purpose")
      .eq("status", "pending"),
    supabase.from("support_conversations")
      .select("status, priority, last_customer_message_at, staff_last_read_at"),
    supabase.from("pending_plan_selections")
      .select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
  ]);

  /* subscription health */
  const active = (subs ?? []) as Row[];
  const expiringSoon = active.filter((s) => s.status === "expiring_soon").length;
  const renewalDue = active.filter((s) => s.status === "renewal_due").length;
  const entRows = (ents ?? []) as Row[];
  const visitsRemaining = entRows.filter((e) => e.status === "available").length;
  const visitsReserved = entRows.filter((e) => e.status === "reserved").length;

  /* capacity */
  const s = sched?.[0] as Row;
  const cap = capSettings?.[0] as Row;
  const weeklySlots = weeklySlotCapacity(
    (hours ?? []) as never, s?.slot_duration_minutes ?? 30, s?.max_bookings_per_slot ?? 3);
  const monthlySlots = Math.round(weeklySlots * 4.33);
  const util = utilizationPercent(entRows.length, monthlySlots);
  const warnThreshold = cap?.warning_threshold_percent ?? 80;

  /* upselling — money here is UNPAID pipeline, never collected revenue */
  const pendingIntents = (intents ?? []) as Row[];
  const pipelineKobo = pendingIntents.reduce((sum, i) => sum + (i.amount_kobo ?? 0), 0);

  /* inventory */
  const inv = (items ?? []) as Row[];
  const invWarnDays = (invSettings?.[0] as Row)?.expiry_warning_days ?? 30;
  const outOfStock = inv.filter((i) => stockLevel(i as never) === "out_of_stock").length;
  const lowStock = inv.filter((i) => stockLevel(i as never) === "low_stock").length;
  const expiring = inv.filter((i) =>
    ["expired", "expiring_soon"].includes(expiryStatus(i.expiry_date, invWarnDays, today))).length;

  /* expenses (this month) */
  const exp = (expenses ?? []) as Row[];
  const paidKobo = exp.filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + e.amount_kobo, 0);
  const approvedKobo = exp.filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + e.amount_kobo, 0);
  const awaitingApproval = exp.filter((e) => e.status === "pending_approval").length;

  /* support */
  const conv = (convs ?? []) as Row[];
  const openConvs = conv.filter((c) => !["resolved", "closed"].includes(c.status));
  const unread = openConvs.filter((c) =>
    c.last_customer_message_at &&
    (!c.staff_last_read_at || c.last_customer_message_at > c.staff_last_read_at)).length;
  const urgent = openConvs.filter((c) => c.priority === "urgent").length;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Operations Dashboard</h1>
        <p className="mt-2 text-sm text-ink-soft">
          One screen for the day-to-day health of the salon.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Subscription health" href="/admin/retention" linkLabel="Retention">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={active.length} label="Active subscribers" />
            <Stat value={expiringSoon + renewalDue} label="Expiring / renewal due"
              tone={expiringSoon + renewalDue > 0 ? "amber" : undefined} />
            <Stat value={pendingSelections ?? 0} label="Pending plan selections" />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {visitsRemaining} visits still owed this cycle, {visitsReserved} reserved
            for upcoming bookings.
          </p>
        </Section>

        <Section title="Capacity" href="/admin/capacity" linkLabel="Capacity">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-soft">
              {entRows.length} promised visits vs ~{monthlySlots} slots this month
            </p>
            <Badge tone={util >= 90 ? "red" : util >= warnThreshold ? "amber" : "green"}>
              {util}%
            </Badge>
          </div>
          <div className="mt-2"><Meter value={Math.min(util, 100)} max={100} /></div>
          <p className="mt-2 text-xs text-ink-soft">
            Hard stop {cap?.enforce_hard_stop ? "ON" : "OFF"} at{" "}
            {cap?.hard_stop_threshold_percent ?? 100}% · warning at {warnThreshold}%.
          </p>
        </Section>

        <Section title="Upselling" href="/admin/upsell" linkLabel="Upselling">
          <div className="grid grid-cols-2 gap-3">
            <Stat value={pendingIntents.length} label="Payment intents awaiting transfer" />
            <Stat value={formatNaira(pipelineKobo)} label="Pipeline value — not yet collected" />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            These are unpaid intents (plan activations, add-ons, consultations).
            Money only counts when confirmed manually.
          </p>
        </Section>

        <Section title="Inventory" href="/admin/inventory/alerts" linkLabel="Stock alerts">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={outOfStock} label="Out of stock" tone={outOfStock > 0 ? "red" : undefined} />
            <Stat value={lowStock} label="Low stock" tone={lowStock > 0 ? "amber" : undefined} />
            <Stat value={expiring} label="Expired / expiring soon"
              tone={expiring > 0 ? "amber" : undefined} />
          </div>
        </Section>

        <Section title="Expenses (this month)" href="/admin/expenses/dashboard" linkLabel="Spending">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={formatNaira(paidKobo)} label="Paid out" />
            <Stat value={formatNaira(approvedKobo)} label="Approved, awaiting payment" />
            <Stat value={awaitingApproval} label="Awaiting approval"
              tone={awaitingApproval > 0 ? "amber" : undefined} />
          </div>
        </Section>

        <Section title="Support" href="/admin/support" linkLabel="Inbox">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={openConvs.length} label="Open conversations" />
            <Stat value={unread} label="Awaiting a reply" tone={unread > 0 ? "amber" : undefined} />
            <Stat value={urgent} label="Urgent" tone={urgent > 0 ? "red" : undefined} />
          </div>
        </Section>
      </div>
    </div>
  );
}
