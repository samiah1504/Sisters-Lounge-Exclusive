import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth";
import { MemberImport } from "@/components/admin/member-import";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Migrate Members" };
export const dynamic = "force-dynamic";

export default async function MemberMigrationPage() {
  await requireAdmin();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Migrate Members</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Bring your existing manual members into the club (v3 §9). Dry-run
          validates every row first; importing creates accounts and activates
          memberships through the standard activation path, so cycles and
          visit balances are exactly right. Re-running the same file is safe —
          already-active members are skipped.
        </p>
      </div>
      <Card>
        <MemberImport />
      </Card>
      <Card className="border-dashed">
        <p className="text-sm font-semibold">Format</p>
        <p className="mt-1 text-sm text-ink-soft">
          Columns: <code>full_name, email, phone, whatsapp, plan_code,
          start_date, home_salon</code>. WhatsApp defaults to the phone
          number; start date defaults to today; home salon (city name)
          defaults to the first open salon. Plan codes are on each
          membership plan&apos;s edit page. Imported members sign in with
          &quot;Forgot password&quot; on their email address.
        </p>
      </Card>
    </div>
  );
}
