import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { Badge, Card } from "@/components/ui";
import {
  CreateStaffForm,
  StaffActiveToggle,
  StaffHoursForm,
  StaffSkills,
} from "@/components/admin/staff-tools";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Staff & Stylists" };
export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*, skills:stylist_skills(skill), hours:staff_working_hours(*)")
    .in("role", ["staff", "admin"])
    .order("created_at");
  const staff = (data ?? []) as Row[];
  const keyConfigured = hasServiceRoleKey();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Staff &amp; Stylists
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Create logins for your team, manage their skills and working hours.
          Customers never see this — stylists are always assigned by the salon.
        </p>
      </div>

      {!keyConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm">
            <strong>One-time setup needed:</strong> creating staff accounts
            requires the <code>SUPABASE_SERVICE_ROLE_KEY</code> environment
            variable on the server. Add it in Vercel → Settings → Environment
            Variables (copy the service_role key from Supabase → Project
            Settings → API), then redeploy. Skills and hours editing below
            work without it.
          </p>
        </Card>
      )}

      <Card>
        <p className="mb-3 font-semibold">Add a staff member</p>
        <CreateStaffForm />
      </Card>

      <div className="grid gap-3">
        {staff.map((member) => {
          const skills = (member.skills as Array<{ skill: string }>).map((s) => s.skill);
          const hours = (member.hours as Array<{
            day_of_week: number; start_time: string; end_time: string;
          }>) ?? [];
          const isSelf = member.id === session.userId;
          return (
            <Card key={member.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-full text-lg font-bold text-white ${member.is_active ? "bg-brand-600" : "bg-neutral-400"}`}>
                    {(member.full_name || member.email || "?")[0].toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {member.full_name || member.email}
                      {isSelf && <span className="ml-1 text-sm font-normal text-ink-soft">(you)</span>}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {member.email} {member.phone ? `· ${member.phone}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={member.role === "admin" ? "gold" : "brand"}>
                    {member.role}
                  </Badge>
                  <Badge tone={member.is_active ? "green" : "red"}>
                    {member.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <StaffSkills profileId={member.id} skills={skills} />
              </div>

              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
                  Working hours ({hours.length} day{hours.length !== 1 ? "s" : ""}/week)
                </summary>
                <div className="mt-3">
                  <StaffHoursForm profileId={member.id} hours={hours} />
                </div>
              </details>

              {!isSelf && (
                <div className="mt-3 border-t border-line pt-3">
                  <StaffActiveToggle
                    profileId={member.id}
                    active={member.is_active}
                    name={member.full_name || member.email}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-ink-soft">
        Deactivating a staff member blocks their login and removes them from
        stylist assignment; their history is kept. Every create/deactivate is
        written to the audit log.
      </p>
    </div>
  );
}
