import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveInventorySettings } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Inventory Settings" };
export const dynamic = "force-dynamic";

export default async function InventorySettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_settings").select("*").limit(1);
  const settings = (data?.[0] ?? null) as Row | null;

  return (
    <div className="grid max-w-2xl gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Inventory Settings</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Controls for stock alerts and adjustment approvals.
        </p>
      </div>
      {settings && (
        <Card>
          <ActionForm action={saveInventorySettings} submitLabel="Save settings" warnUnsaved>
            <div className="grid gap-4">
              <Field
                label="Expiry warning (days before expiry)"
                htmlFor="expiry_warning_days"
                hint="Items expiring within this window appear in Stock Alerts."
              >
                <input id="expiry_warning_days" name="expiry_warning_days" type="number"
                  min={1} max={365} defaultValue={settings.expiry_warning_days}
                  className={inputClass} />
              </Field>
              <Field
                label="High-value adjustment threshold (₦)"
                htmlFor="high_value_adjustment_naira"
                hint="Stock-count adjustments worth more than this need admin review."
              >
                <input id="high_value_adjustment_naira" name="high_value_adjustment_naira"
                  type="number" min={0}
                  defaultValue={Math.round((settings.high_value_adjustment_kobo ?? 0) / 100)}
                  className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allow_negative_stock"
                  className="h-5 w-5 accent-brand-600"
                  defaultChecked={settings.allow_negative_stock} />
                Allow stock to go below zero (not recommended)
              </label>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
