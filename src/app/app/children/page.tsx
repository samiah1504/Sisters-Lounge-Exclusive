import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/server/auth";
import { getChildren, getSubscriptionOverviews } from "@/server/customer";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "My Children" };
export const dynamic = "force-dynamic";

function age(dob: string): number {
  const b = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() ||
      (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export default async function ChildrenPage() {
  const session = await requireCustomer();
  const [childrenList, overviews] = await Promise.all([
    getChildren(session.customerProfile.id),
    getSubscriptionOverviews(session.customerProfile.id),
  ]);
  const active = childrenList.filter((c) => c.is_active);
  const archived = childrenList.filter((c) => !c.is_active);

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">My Children</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Manage each child&apos;s profile, plan and visits from your account.
          </p>
        </div>
        <ButtonLink href="/app/children/new">Add Child</ButtonLink>
      </div>

      {active.length === 0 && archived.length === 0 && (
        <EmptyState
          title="No child profiles yet"
          message="Add your children to subscribe them to kids' plans and book their salon visits."
          action={<ButtonLink href="/app/children/new">Add your first child</ButtonLink>}
        />
      )}

      <div className="grid gap-3">
        {active.map((c) => {
          const sub = overviews.find(
            (o) => o.child?.id === c.id &&
              ["active", "expiring_soon", "renewal_due"].includes(o.subscription.status),
          );
          return (
            <Link key={c.id} href={`/app/children/${c.id}`}>
              <Card className="flex items-center gap-4 hover:border-brand-400">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {c.full_name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.full_name}</p>
                  <p className="text-sm text-ink-soft">
                    {age(c.date_of_birth)} years old
                    {sub ? ` · ${sub.plan.name} plan` : " · no active plan"}
                  </p>
                </div>
                {sub && (
                  <Badge tone="green">
                    {sub.summary.remaining} visit{sub.summary.remaining !== 1 ? "s" : ""} left
                  </Badge>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {archived.length > 0 && (
        <details className="rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold text-ink-soft">
            Archived profiles ({archived.length})
          </summary>
          <div className="mt-3 grid gap-2">
            {archived.map((c) => (
              <Link
                key={c.id}
                href={`/app/children/${c.id}`}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 opacity-70 hover:opacity-100"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-400 text-sm font-bold text-white">
                  {c.full_name[0]}
                </span>
                <span className="font-medium">{c.full_name}</span>
                <Badge tone="gray">Archived</Badge>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
