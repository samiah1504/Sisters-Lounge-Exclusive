import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaffOrAdmin } from "@/server/auth";
import { generateRecurringNow, saveExpense } from "@/server/actions/operations";
import { ActionButton, ActionForm } from "@/components/action-form";
import { ExpenseActions } from "@/components/admin/expense-actions";
import { formatDate, formatNaira } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, Field, inputClass, statusLabel } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "gray" | "amber" | "green" | "red"> = {
  draft: "gray", pending_approval: "amber", approved: "amber",
  rejected: "red", paid: "green", voided: "gray",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireStaffOrAdmin();
  const { status = "all" } = await searchParams;
  const supabase = await createClient();
  const [{ data: expensesData }, { data: categories }] = await Promise.all([
    supabase.from("expenses")
      .select("*, category:expense_categories(name), enterer:profiles!expenses_entered_by_fkey(full_name)")
      .order("expense_date", { ascending: false }).limit(100),
    supabase.from("expense_categories").select("id, name").eq("is_active", true).order("display_order"),
  ]);
  let expenses = (expensesData ?? []) as Row[];
  if (status !== "all") expenses = expenses.filter((e) => e.status === status);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-rule font-display text-2xl text-ink">Expenses</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Draft → submit → approve → pay. Submitted records lock; corrections
            are made by voiding, never deleting.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/admin/expenses/dashboard" variant="outline">Dashboard</ButtonLink>
          <ButtonLink href="/admin/expenses/recurring" variant="outline">Recurring</ButtonLink>
        </div>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["all", "draft", "pending_approval", "approved", "paid", "rejected", "voided"].map((k) => (
          <Link key={k} href={`/admin/expenses?status=${k}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${status === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft"}`}>
            {k === "all" ? "All" : statusLabel(k)}
          </Link>
        ))}
      </div>

      <Card>
        <p className="mb-3 font-semibold">Record an expense</p>
        <ActionForm action={saveExpense.bind(null, null)} submitLabel="Save draft">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date" htmlFor="exp-date">
              <input id="exp-date" name="expense_date" type="date"
                defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </Field>
            <Field label="Amount (₦)" htmlFor="exp-amount">
              <input id="exp-amount" name="amount_naira" type="number" min={0} step="0.01" required className={inputClass} />
            </Field>
            <Field label="Category" htmlFor="exp-cat">
              <select id="exp-cat" name="category_id" className={inputClass}>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Payee / vendor" htmlFor="exp-payee">
              <input id="exp-payee" name="payee" className={inputClass} />
            </Field>
            <Field label="Payment method" htmlFor="exp-method">
              <select id="exp-method" name="payment_method" className={inputClass} defaultValue="transfer">
                {["cash", "transfer", "card", "pos", "other"].map((m) => (
                  <option key={m} value={m}>{statusLabel(m)}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference number" htmlFor="exp-ref">
              <input id="exp-ref" name="reference_number" className={inputClass} />
            </Field>
          </div>
          <Field label="Description" htmlFor="exp-desc">
            <input id="exp-desc" name="description" required className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      {session.profile.role === "admin" && (
        <div className="flex justify-end">
          <ActionButton action={generateRecurringNow} label="Generate due recurring drafts" variant="outline" />
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState title="No expenses" message="Nothing matches this filter." />
      ) : (
        <div className="grid gap-2.5">
          {expenses.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatNaira(e.amount_kobo)}
                    <span className="ml-2 text-sm font-normal text-ink-soft">
                      {(e.category as { name: string })?.name}
                    </span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    {e.description} · {formatDate(e.expense_date)}
                    {e.payee && ` · ${e.payee}`} · by {(e.enterer as { full_name: string })?.full_name}
                    {!e.receipt_url && " · no receipt"}
                  </p>
                  {e.void_reason && (
                    <p className="text-sm text-red-700">Voided: {e.void_reason}</p>
                  )}
                </div>
                <Badge tone={TONE[e.status] ?? "gray"}>{statusLabel(e.status)}</Badge>
              </div>
              <div className="mt-3">
                <ExpenseActions expenseId={e.id} status={e.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
