"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { requireAdmin } from "@/server/auth";
import { parseMemberImport, type ImportRow } from "@/lib/migration";

/**
 * Member migration import (v3 §9 — launch requirement).
 * Dry-run first, then import. Every activation goes through
 * fn_activate_manual_subscription, so cycles and visit entitlements are
 * created by the same audited path as everything else. Safely repeatable:
 * an already-active recipient is skipped, never duplicated.
 */

export interface ImportResult {
  line: number;
  name: string;
  email: string;
  outcome: "invalid" | "would_import" | "imported" | "skipped_active" | "failed";
  detail: string;
}

async function loadContext() {
  const supabase = await createClient();
  const [{ data: plans }, { data: salons }] = await Promise.all([
    supabase.from("subscription_plans")
      .select("id, plan_code, status").neq("status", "archived"),
    supabase.from("salons").select("id, city, slug, status"),
  ]);
  return {
    plans: plans ?? [],
    salons: salons ?? [],
    planCodes: (plans ?? []).map((p) => p.plan_code as string),
    salonKeys: (salons ?? []).flatMap((s) => [s.city as string, s.slug as string]),
  };
}

function resolveSalonId(
  salons: Array<{ id: string; city: string; slug: string; status: string }>,
  key: string | null,
): string | null {
  if (!key) return null; // activation falls back to the earliest open salon
  const k = key.toLowerCase();
  return salons.find(
    (s) => s.city.toLowerCase() === k || s.slug.toLowerCase() === k,
  )?.id ?? null;
}

export async function previewMemberImport(csv: string): Promise<{
  error?: string;
  rows?: ImportRow[];
}> {
  await requireAdmin();
  const ctx = await loadContext();
  const { headerError, rows } = parseMemberImport(csv, ctx);
  if (headerError) return { error: headerError };
  return { rows };
}

export async function runMemberImport(csv: string): Promise<{
  error?: string;
  results?: ImportResult[];
}> {
  await requireAdmin();
  if (!hasServiceRoleKey()) {
    return {
      error:
        "Member import needs the SUPABASE_SERVICE_ROLE_KEY environment variable (server-side) to create accounts.",
    };
  }
  const ctx = await loadContext();
  const { headerError, rows } = parseMemberImport(csv, ctx);
  if (headerError) return { error: headerError };

  const supabase = await createClient(); // acts as the signed-in admin (RLS applies)
  const admin = createAdminClient();     // service role: account creation only
  const results: ImportResult[] = [];

  for (const row of rows) {
    const base = { line: row.line, name: row.full_name, email: row.email };
    if (row.errors.length > 0) {
      results.push({ ...base, outcome: "invalid", detail: row.errors.join("; ") });
      continue;
    }

    try {
      // 1. Find or create the auth account (idempotent by email).
      const { data: existing } = await admin
        .from("profiles").select("id").eq("email", row.email).limit(1);
      let userId = existing?.[0]?.id as string | undefined;
      let created = false;
      if (!userId) {
        const password = `Migrated!${crypto.randomUUID().slice(0, 8)}`;
        const { data: user, error } = await admin.auth.admin.createUser({
          email: row.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.full_name },
        });
        if (error || !user.user) {
          results.push({ ...base, outcome: "failed", detail: error?.message ?? "account creation failed" });
          continue;
        }
        userId = user.user.id;
        created = true;
      }

      // 2. Contact details (booking readiness: name, phone, whatsapp).
      await admin.from("profiles")
        .update({ full_name: row.full_name, phone: row.phone })
        .eq("id", userId);
      await admin.from("customer_profiles")
        .update({ whatsapp_number: row.whatsapp })
        .eq("profile_id", userId);

      const { data: cp } = await admin
        .from("customer_profiles").select("id").eq("profile_id", userId).limit(1);
      if (!cp?.[0]) {
        results.push({ ...base, outcome: "failed", detail: "no member profile (is this a staff email?)" });
        continue;
      }

      // 3. Activate through the standard audited path (v3 §9).
      const plan = ctx.plans.find(
        (p) => (p.plan_code as string).toLowerCase() === row.plan_code.toLowerCase());
      const { error: actError } = await supabase.rpc("fn_activate_manual_subscription", {
        p_customer_id: cp[0].id,
        p_plan_id: plan!.id,
        p_child_id: null,
        p_starts_on: row.start_date,
        p_reason: "migrated member import",
        p_home_salon_id: resolveSalonId(ctx.salons, row.home_salon),
        p_activation_source: "migration",
      });
      if (actError) {
        if (/already has an active/i.test(actError.message)) {
          results.push({
            ...base, outcome: "skipped_active",
            detail: "membership already active — nothing changed (safe re-run)",
          });
        } else {
          results.push({ ...base, outcome: "failed", detail: actError.message });
        }
        continue;
      }

      results.push({
        ...base, outcome: "imported",
        detail: created
          ? "account created + membership activated (member signs in via password reset)"
          : "existing account — membership activated",
      });
    } catch (e) {
      results.push({
        ...base, outcome: "failed",
        detail: e instanceof Error ? e.message : "unexpected error",
      });
    }
  }

  revalidatePath("/admin/customers");
  return { results };
}
