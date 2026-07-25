import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { formatNaira } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Expense Dashboard" };
export const dynamic = "force-dynamic";

export default async function ExpenseDashboardPage() {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const [{ data: expensesData }, { data: dueTemplates }] = await Promise.all([
    supabase.from("expenses")
      .select("amount_kobo, status, expense_date, receipt_url, category:expense_categories(name)")
      .neq("status", "voided"),
    supabase.from("recurring_expense_templates").select("description, amount_kobo, next_due_date")
      .eq("is_active", true).lte("next_due_date", new Date().toISOString().slice(0, 10)),
  ]);
  const all = (expensesData ?? []) as Row[];
  const thisMonth = all.filter((e) => e.expense_date >= monthStartIso);
  const sum = (rows: Row[]) => rows.reduce((t, e) => t + Number(e.amount_kobo), 0);

  const recordedMonth = sum(thisMonth);
  const approvedUnpaid = all.filter((e) => e.status === "approved");
  const paidMonth = thisMonth.filter((e) => e.status === "paid");
  const pending = all.filter((e) => e.status === "pending_approval");
  const missingReceipts = all.filter((e) => !e.receipt_url && ["approved", "paid"].includes(e.status));

  const byCategory = new Map<string, number>();
  for (const e of thisMonth) {
    const name = (e.category as { name: string })?.name ?? "—";
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(e.amount_kobo));
  }
  const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Expense Dashboard</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Recorded ≠ approved ≠ paid. Only the &quot;paid&quot; figures represent
          cash that has actually left the business.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="font-display text-2xl font-bold text-brand-900">{formatNaira(recordedMonth)}</p>
          <p className="text-sm text-ink-soft">Recorded this month <Badge tone="gray">recorded</Badge></p>
        </Card>
        <Card>
          <p className="font-display text-2xl font-bold text-brand-900">{formatNaira(sum(paidMonth))}</p>
          <p className="text-sm text-ink-soft">Paid this month <Badge tone="green">paid</Badge></p>
        </Card>
        <Card>
          <p className="font-display text-2xl font-bold text-brand-900">{formatNaira(sum(approvedUnpaid))}</p>
          <p className="text-sm text-ink-soft">Approved but unpaid <Badge tone="amber">not yet cash</Badge></p>
        </Card>
        <Card>
          <p className="font-display text-2xl font-bold text-brand-900">{pending.length}</p>
          <p className="text-sm text-ink-soft">
            <Link href="/admin/expenses?status=pending_approval" className="underline">Awaiting approval</Link>
            {" "}({formatNaira(sum(pending))})
          </p>
        </Card>
      </div>

      <Card>
        <p className="font-semibold">This month by category</p>
        {topCategories.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No expenses recorded this month.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {topCategories.map(([name, value]) => (
                <tr key={name} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium">{name}</td>
                  <td className="py-2 text-right">{formatNaira(value)}</td>
                  <td className="w-1/3 py-2 pl-3">
                    <div className="h-2 rounded-full bg-brand-100">
                      <div className="h-full rounded-full bg-brand-600"
                        style={{ width: `${Math.round((value / (topCategories[0][1] || 1)) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(dueTemplates ?? []).length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-semibold">Recurring expenses due</p>
          <ul className="mt-1 grid gap-1 text-sm">
            {(dueTemplates ?? []).map((t, i) => (
              <li key={i}>{t.description} — {formatNaira(t.amount_kobo)} (due {t.next_due_date})</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            Generate drafts from the Expenses page or wait for the daily job.
          </p>
        </Card>
      )}

      {missingReceipts.length > 0 && (
        <Card>
          <p className="font-semibold">Missing receipts</p>
          <p className="mt-1 text-sm text-ink-soft">
            {missingReceipts.length} approved/paid expense(s) have no receipt
            reference — worth chasing for records.
          </p>
        </Card>
      )}
    </div>
  );
}
