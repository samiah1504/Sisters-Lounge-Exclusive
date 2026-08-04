import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { visitSummary } from "@/lib/booking-rules";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import {
  AppointmentStatusBadge,
  Badge,
  Card,
  SubscriptionStatusBadge,
} from "@/components/ui";
import { CustomerAdminTools } from "@/components/admin/customer-tools";
import type { VisitEntitlement } from "@/lib/types";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffOrAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rows }, { data: plans }] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select(
        "*, profile:profiles(full_name, email, phone), " +
          "children:children(id, full_name, is_active), " +
          "tags:customer_tag_assignments(tag:customer_tags(id, name)), " +
          "notes:customer_internal_notes(note, created_at, author:profiles(full_name)), " +
          "selections:pending_plan_selections(id, status, created_at, plan:subscription_plans(name))",
      )
      .eq("id", id)
      .limit(1),
    supabase
      .from("subscription_plans")
      .select("id, name, status")
      .in("status", ["active", "hidden", "closed"])
      .order("display_order"),
  ]);
  const customer = ((rows ?? []) as Row[])[0];
  if (!customer) notFound();

  const [{ data: subsData }, { data: apptsData }, { data: prompts }, { data: noShows }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "*, plan:subscription_plans(name), child:children(full_name), " +
          "cycles:subscription_cycles(id, cycle_number, starts_on, ends_on, status, " +
          "entitlements:visit_entitlements(status))",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, starts_at, status, addon_total_kobo, service:services(name), child:children(full_name)")
      .eq("customer_id", id)
      .order("starts_at", { ascending: false })
      .limit(15),
    supabase
      .from("retention_prompts")
      .select("title, prompt_type, dismissed_at")
      .eq("customer_id", id)
      .is("dismissed_at", null),
    // v3 §5.7: no-show history for salon managers (fair = transparent).
    supabase
      .from("member_no_shows")
      .select("id, occurred_at, salon:salons(city)")
      .eq("customer_id", id)
      .order("occurred_at", { ascending: false })
      .limit(12),
  ]);
  const subs = (subsData ?? []) as Row[];
  const appts = (apptsData ?? []) as Row[];

  const profile = customer.profile as unknown as {
    full_name: string; email: string | null; phone: string | null;
  };
  const childrenList = customer.children as Array<{ id: string; full_name: string; is_active: boolean }>;
  const tags = (customer.tags as Array<{ tag: { id: string; name: string } }>).map((t) => t.tag).filter(Boolean);
  const isAdmin = session.profile.role === "admin";

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{profile?.full_name || "Customer"}</h1>
          <p className="text-sm text-ink-soft">
            {profile?.email} · {profile?.phone ?? "no phone"} · WhatsApp{" "}
            {customer.whatsapp_number ?? "—"}
          </p>
          <p className="text-sm text-ink-soft">
            {customer.address ? `${customer.address}, ${customer.city}, ${customer.state}` : "No address"}
          </p>
        </div>
        {customer.account_status === "archived" && <Badge tone="gray">Archived</Badge>}
      </div>

      {tags.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t.id} className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {t.name}
            </span>
          ))}
        </p>
      )}

      {(prompts ?? []).length > 0 && (
        <Card className="border-gold-300 bg-gold-100/40">
          <p className="text-sm font-semibold">Active retention prompts</p>
          <ul className="mt-1 grid gap-1 text-sm text-ink-soft">
            {(prompts ?? []).map((p, i) => (
              <li key={i}>• {p.title}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* subscriptions with balances */}
      {subs.map((s) => {
        const cycles = (s.cycles as Array<{
          id: string; cycle_number: number; starts_on: string; ends_on: string;
          status: string; entitlements: VisitEntitlement[];
        }>).sort((a, b) => b.cycle_number - a.cycle_number);
        const current = cycles.find((c) => c.status === "active") ?? cycles[0];
        const summary = current ? visitSummary(current.entitlements) : null;
        return (
          <Card key={s.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {(s.plan as { name: string })?.name}
                {s.child && (
                  <span className="text-ink-soft">
                    {" "}· for {(s.child as { full_name: string }).full_name}
                  </span>
                )}
              </p>
              <SubscriptionStatusBadge status={s.status} />
            </div>
            {current && summary && (
              <p className="mt-1 text-sm text-ink-soft">
                Cycle {current.cycle_number}: {formatDate(current.starts_on)} →{" "}
                {formatDate(current.ends_on)} · {summary.remaining} remaining ·{" "}
                {summary.reserved} reserved · {summary.used} used of {summary.included}
              </p>
            )}
            {isAdmin && current && current.status === "active" && (
              <CustomerAdminTools.AdjustVisits customerId={id} cycleId={current.id} />
            )}
          </Card>
        );
      })}

      {(customer.selections as Array<{ id: string; status: string; created_at: string; plan: { name: string } }>)
        .filter((sel) => sel.status === "pending_payment")
        .map((sel) => (
          <Card key={sel.id} className="border-amber-200 bg-amber-50">
            <p className="text-sm">
              <strong>Pending plan selection:</strong> {sel.plan?.name} · since{" "}
              {formatDate(sel.created_at)} — awaiting payment phase or manual activation.
            </p>
          </Card>
        ))}

      {/* children */}
      <Card>
        <p className="font-semibold">Children</p>
        {childrenList.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">None.</p>
        ) : (
          <ul className="mt-1 grid gap-1 text-sm">
            {childrenList.map((c) => (
              <li key={c.id}>
                {c.full_name} {!c.is_active && <Badge tone="gray">archived</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* bookings */}
      <Card>
        <p className="font-semibold">Recent bookings</p>
        {appts.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No bookings yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2 text-sm">
            {appts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/bookings/${a.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 hover:border-brand-400"
                >
                  <span>
                    {(a.service as unknown as { name: string })?.name}
                    {a.child && ` → ${(a.child as unknown as { full_name: string }).full_name}`}
                    <span className="block text-ink-soft">
                      {formatDateTime(a.starts_at)}
                      {a.addon_total_kobo > 0 && ` · add-ons ${formatNaira(a.addon_total_kobo)}`}
                    </span>
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* admin tools */}
      <CustomerAdminTools.Panel
        customerId={id}
        isAdmin={isAdmin}
        archived={customer.account_status === "archived"}
        childOptions={childrenList.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.full_name }))}
        planOptions={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))}
        tags={tags}
      />

      {/* no-show history (v3 §5.7) */}
      {((noShows ?? []) as Row[]).length > 0 && (
        <Card className="border-amber-200">
          <p className="font-semibold">
            Missed visits ({(noShows ?? []).length} recorded)
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Missed visits never consume the member&apos;s balance. Repeated
            misses warn the member and can briefly pause new self-service
            reservations (policy under Scheduling Settings) — the team can
            always reserve on their behalf.
          </p>
          <ul className="mt-2 grid gap-1 text-sm">
            {((noShows ?? []) as Row[]).map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span>{formatDateTime(n.occurred_at)}</span>
                <span className="text-ink-soft">{(n.salon as Row)?.city ?? ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* internal notes */}
      <Card>
        <p className="font-semibold">Internal notes (staff only)</p>
        <ul className="mt-2 grid gap-2 text-sm">
          {(customer.notes as Array<{ note: string; created_at: string; author: { full_name: string } }>)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((n, i) => (
              <li key={i} className="rounded-xl bg-brand-50 px-3 py-2">
                {n.note}
                <span className="block text-xs text-ink-soft">
                  {n.author?.full_name} · {formatDateTime(n.created_at)}
                </span>
              </li>
            ))}
        </ul>
        <CustomerAdminTools.AddNote customerId={id} />
      </Card>
    </div>
  );
}
