"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";

export interface ActionState {
  error?: string;
  success?: string;
}

function friendly(message: string): string {
  if (/STATE:/.test(message)) return "That change is not allowed from the salon's current status.";
  if (/REASON_REQUIRED/.test(message)) return "A reason is required.";
  if (/permission denied/.test(message)) return "You do not have permission for this action.";
  return message;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const salonSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(20).nullable(),
  whatsapp: z.string().trim().max(20).nullable(),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  chair_capacity: z.coerce.number().int().min(1).max(50),
  launch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(["planned", "waitlist"]).optional(), // creation only
});

/** Create/edit a salon (v3 §7.3). Status transitions go through the
 *  dedicated lifecycle actions below, never this form. */
export async function saveSalon(
  salonId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const opt = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const parsed = salonSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    state: formData.get("state"),
    address: formData.get("address") ?? "",
    phone: opt("phone"),
    whatsapp: opt("whatsapp"),
    latitude: opt("latitude"),
    longitude: opt("longitude"),
    chair_capacity: formData.get("chair_capacity") ?? 3,
    launch_date: opt("launch_date"),
    status: salonId ? undefined : String(formData.get("status") ?? "planned"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { status, ...row } = parsed.data;

  const supabase = await createClient();
  if (salonId) {
    const { error } = await supabase.from("salons").update(row).eq("id", salonId);
    if (error) return { error: friendly(error.message) };
    revalidatePath(`/admin/salons/${salonId}`);
    revalidatePath("/admin/salons");
    return { success: "Salon saved." };
  }

  const { data, error } = await supabase
    .from("salons")
    .insert({ ...row, slug: slugify(`${row.city}-${row.name}`).slice(0, 60), status })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/salons");
  redirect(`/admin/salons/${data.id}`);
}

export async function launchSalon(salonId: string): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_launch_salon", { p_salon_id: salonId });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/salons/${salonId}`);
  revalidatePath("/admin/salons");
  return { success: "Salon is now open — members can reserve visits here." };
}

export async function pauseSalon(salonId: string, reason: string): Promise<ActionState> {
  await requireAdmin();
  if (!reason.trim()) return { error: "A reason is required to pause a salon." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pause_salon", {
    p_salon_id: salonId,
    p_reason: reason.trim(),
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/salons/${salonId}`);
  revalidatePath("/admin/salons");
  return {
    success: `Salon paused. ${data ?? 0} future reservation${data === 1 ? "" : "s"} released — contact the affected members below.`,
  };
}

export async function reopenSalon(salonId: string): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reopen_salon", { p_salon_id: salonId });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/salons/${salonId}`);
  revalidatePath("/admin/salons");
  return { success: "Salon reopened." };
}

export async function closeSalon(salonId: string, reason: string): Promise<ActionState> {
  await requireAdmin();
  if (!reason.trim()) return { error: "A reason is required to close a salon." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_close_salon", {
    p_salon_id: salonId,
    p_reason: reason.trim(),
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/salons/${salonId}`);
  revalidatePath("/admin/salons");
  return {
    success: `Salon closed. ${data ?? 0} future reservation${data === 1 ? "" : "s"} released — contact the affected members below.`,
  };
}

/* ------------------------------------------------ staff ↔ salon (v3 §4.6) -- */

export async function addStaffAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  const salonId = String(formData.get("salon_id") ?? "");
  if (!profileId || !salonId) return { error: "Pick a staff member and a salon." };
  const supabase = await createClient();
  const { error } = await supabase.from("staff_salon_assignments").insert({
    profile_id: profileId,
    salon_id: salonId,
    is_primary: formData.get("is_primary") === "on",
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "That staff member is already assigned to this salon." };
    }
    return { error: friendly(error.message) };
  }
  revalidatePath(`/admin/salons/${salonId}`);
  return { success: "Staff assigned. Note: scheduled hours at other salons stay put — move them under Scheduling Settings (v3 #36)." };
}

export async function removeStaffAssignment(
  assignmentId: string,
  salonId: string,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();

  // v3 #36: a stylist cannot leave a salon while still assigned to future
  // visits there — those must be manually reassigned first.
  const { data: assignment } = await supabase
    .from("staff_salon_assignments")
    .select("profile_id")
    .eq("id", assignmentId)
    .single();
  if (assignment) {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("stylist_profile_id", assignment.profile_id)
      .gte("starts_at", new Date().toISOString())
      .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"]);
    if ((count ?? 0) > 0) {
      return {
        error: `This stylist still has ${count} upcoming assigned visit${count === 1 ? "" : "s"} at this salon — reassign those first (v3 #36).`,
      };
    }
  }

  const { error } = await supabase
    .from("staff_salon_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/salons/${salonId}`);
  return { success: "Assignment removed." };
}
