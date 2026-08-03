import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import {
  duplicatePlan,
  movePlan,
  setPlanStatus,
} from "@/server/actions/admin";
import { formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Membership Plans" };
export const dynamic = "force-dynamic";

const STATUS_TONES = {
  draft: "gray", active: "green", hidden: "amber", closed: "amber", archived: "gray",
} as const;

export default async function AdminPlansPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*, category:subscription_categories(name), subscriptions(id)")
    .order("display_order");

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="heading-rule font-display text-2xl text-ink">Membership Plans</h1>
        <ButtonLink href="/admin/plans/new">Create plan</ButtonLink>
      </div>

      <div className="grid gap-2.5">
        {(plans ?? []).map((p, i) => {
          const subscriberCount = (p.subscriptions as Array<unknown>).length;
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {p.name}
                    <span className="ml-2 text-sm font-normal text-ink-soft">
                      {(p.category as { name: string })?.name} · {p.plan_code}
                    </span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    {formatNaira(p.monthly_price_kobo)}/month · {p.visits_included} visits ·
                    interval {p.min_visit_interval_days}d · {subscriberCount} membership
                    {subscriberCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONES[p.status as keyof typeof STATUS_TONES]}>
                  {p.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Link className="font-semibold text-brand-600 hover:underline" href={`/admin/plans/${p.id}`}>
                  Edit
                </Link>
                <Link className="font-semibold text-brand-600 hover:underline" href={`/plans/${p.slug}`} target="_blank">
                  Preview
                </Link>
                {p.status !== "active" && p.status !== "archived" && (
                  <form action={setPlanStatus.bind(null, p.id, "active")}>
                    <button className="font-semibold text-emerald-700 hover:underline">Activate</button>
                  </form>
                )}
                {p.status === "active" && (
                  <>
                    <form action={setPlanStatus.bind(null, p.id, "hidden")}>
                      <button className="font-semibold text-amber-700 hover:underline">Hide</button>
                    </form>
                    <form action={setPlanStatus.bind(null, p.id, "closed")}>
                      <button className="font-semibold text-amber-700 hover:underline">
                        Close to new members
                      </button>
                    </form>
                  </>
                )}
                {p.status !== "archived" && (
                  <form action={setPlanStatus.bind(null, p.id, "archived")}>
                    <button className="font-semibold text-red-700 hover:underline">
                      Archive
                    </button>
                  </form>
                )}
                <form action={duplicatePlan.bind(null, p.id)}>
                  <button className="font-semibold text-ink-soft hover:underline">Duplicate</button>
                </form>
                <span className="ml-auto flex gap-1">
                  {i > 0 && (
                    <form action={movePlan.bind(null, p.id, -1)}>
                      <button aria-label="Move up" className="rounded-lg border border-line px-2 py-1">↑</button>
                    </form>
                  )}
                  {i < (plans ?? []).length - 1 && (
                    <form action={movePlan.bind(null, p.id, 1)}>
                      <button aria-label="Move down" className="rounded-lg border border-line px-2 py-1">↓</button>
                    </form>
                  )}
                </span>
              </div>
              {p.status === "archived" && subscriberCount > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Archived with existing subscriptions — history is preserved;
                  existing members keep their plan-version snapshot.
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-ink-soft">
        Plans are never hard-deleted. Price or visit changes create a new plan
        version automatically — historical subscriptions keep their original
        snapshot.
      </p>
    </div>
  );
}
