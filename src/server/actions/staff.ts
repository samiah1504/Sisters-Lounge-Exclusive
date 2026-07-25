"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { requireAdmin } from "@/server/auth";

export interface ActionState {
  error?: string;
  success?: string;
}

const MISSING_KEY_MSG =
  "Staff creation needs the SUPABASE_SERVICE_ROLE_KEY environment variable " +
  "on the server (Vercel → Settings → Environment Variables), then redeploy. " +
  "Never expose this key in the browser.";

const staffSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the staff member's full name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().max(20).default(""),
  password: z.string().min(8, "Temporary password must be at least 8 characters").max(72),
  role: z.enum(["staff", "admin"]),
  skills: z.string().trim().max(300).default(""),
});

/** Create a staff/stylist login directly from the admin area. */
export async function createStaffMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  if (!hasServiceRoleKey()) return { error: MISSING_KEY_MSG };

  const parsed = staffSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    role: formData.get("role"),
    skills: formData.get("skills") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name },
  });
  if (error || !created.user) {
    if (/already/i.test(error?.message ?? "")) {
      return { error: "An account with this email already exists." };
    }
    return { error: error?.message ?? "Could not create the account." };
  }
  const userId = created.user.id;

  // The signup trigger created a customer profile; convert it to staff.
  // (Service-role writes are trusted by the guard triggers.)
  await admin
    .from("profiles")
    .update({ role: d.role, full_name: d.full_name, phone: d.phone || null })
    .eq("id", userId);
  await admin.from("customer_profiles").delete().eq("profile_id", userId);

  const skills = d.skills
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (skills.length > 0) {
    await admin.from("stylist_skills").insert(
      skills.map((skill) => ({ staff_profile_id: userId, skill })),
    );
  }

  // Default working hours: Monday-Saturday, 09:00-18:00 (editable below).
  await admin.from("staff_working_hours").insert(
    [1, 2, 3, 4, 5, 6].map((day) => ({
      staff_profile_id: userId,
      day_of_week: day,
      start_time: "09:00",
      end_time: "18:00",
    })),
  );

  await admin.rpc("write_audit", {
    p_action: "staff.create",
    p_entity_type: "profile",
    p_entity_id: userId,
    p_reason: `role=${d.role}`,
  });

  revalidatePath("/admin/staff");
  return {
    success:
      `${d.full_name} can now sign in with ${d.email} and the temporary ` +
      "password you set. Ask them to change it after first login.",
  };
}

/** Deactivate blocks login AND assignment; reactivate restores both. */
export async function setStaffActive(
  profileId: string,
  active: boolean,
): Promise<ActionState> {
  const session = await requireAdmin();
  if (!hasServiceRoleKey()) return { error: MISSING_KEY_MSG };
  if (profileId === session.userId) {
    return { error: "You cannot deactivate your own account." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: active })
    .eq("id", profileId)
    .in("role", ["staff", "admin"]);
  if (error) return { error: error.message };

  // Ban/unban at the auth layer so a deactivated account cannot sign in.
  await admin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : "876000h", // ~100 years
  });

  await admin.rpc("write_audit", {
    p_action: active ? "staff.reactivate" : "staff.deactivate",
    p_entity_type: "profile",
    p_entity_id: profileId,
  });

  revalidatePath("/admin/staff");
  return { success: active ? "Staff member reactivated." : "Staff member deactivated." };
}

export async function addStaffSkill(
  profileId: string,
  skill: string,
): Promise<ActionState> {
  await requireAdmin();
  const clean = skill.trim().toLowerCase();
  if (!clean) return { error: "Skill cannot be empty." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stylist_skills")
    .upsert({ staff_profile_id: profileId, skill: clean });
  if (error) return { error: "Could not add skill." };
  revalidatePath("/admin/staff");
  return {};
}

export async function removeStaffSkill(
  profileId: string,
  skill: string,
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("stylist_skills")
    .delete()
    .eq("staff_profile_id", profileId)
    .eq("skill", skill);
  revalidatePath("/admin/staff");
}

/** Replace a staff member's weekly working hours. */
export async function saveStaffHours(
  profileId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const rows: Array<{ day_of_week: number; start_time: string; end_time: string }> = [];
  for (let d = 0; d <= 6; d++) {
    if (formData.get(`works_${d}`) !== "on") continue;
    const start = String(formData.get(`start_${d}`) ?? "09:00");
    const end = String(formData.get(`end_${d}`) ?? "18:00");
    if (end <= start) return { error: "End time must be after start time." };
    rows.push({ day_of_week: d, start_time: start, end_time: end });
  }
  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("staff_working_hours")
    .delete()
    .eq("staff_profile_id", profileId);
  if (delError) return { error: delError.message };
  if (rows.length > 0) {
    const { error } = await supabase
      .from("staff_working_hours")
      .insert(rows.map((r) => ({ ...r, staff_profile_id: profileId })));
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/staff");
  return { success: "Working hours saved." };
}
