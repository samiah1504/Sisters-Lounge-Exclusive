"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaffOrAdmin } from "@/server/auth";

export interface ActionState {
  error?: string;
  success?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ---------------------------------------------------------- categories --- */

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  short_description: z.string().trim().max(300).default(""),
  full_description: z.string().trim().max(3000).default(""),
  eligibility_notes: z.string().trim().max(1000).default(""),
  service_location_type: z.enum(["salon", "home", "both"]),
  display_order: z.coerce.number().int().min(0).max(999),
  is_active: z.boolean(),
  is_public: z.boolean(),
});

export async function saveCategory(
  categoryId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    short_description: formData.get("short_description") ?? "",
    full_description: formData.get("full_description") ?? "",
    eligibility_notes: formData.get("eligibility_notes") ?? "",
    service_location_type: formData.get("service_location_type"),
    display_order: formData.get("display_order") ?? 0,
    is_active: formData.get("is_active") === "on",
    is_public: formData.get("is_public") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  if (categoryId) {
    const { error } = await supabase
      .from("subscription_categories")
      .update(parsed.data)
      .eq("id", categoryId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("subscription_categories").insert({
      ...parsed.data,
      slug: slugify(parsed.data.name),
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/categories");
  return { success: "Category saved." };
}

export async function archiveCategory(categoryId: string, archive: boolean): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("subscription_categories")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: !archive,
    })
    .eq("id", categoryId);
  revalidatePath("/admin/categories");
}

/* --------------------------------------------------------------- plans --- */

const planSchema = z.object({
  category_id: z.string().uuid("Choose a category"),
  name: z.string().trim().min(2).max(80),
  plan_code: z.string().trim().min(2).max(40),
  tier_label: z.string().trim().max(40).default(""),
  short_description: z.string().trim().max(300).default(""),
  full_description: z.string().trim().max(5000).default(""),
  monthly_price_naira: z.coerce.number().min(0).max(10_000_000),
  visits_included: z.coerce.number().int().min(1).max(31),
  min_visit_interval_days: z.coerce.number().int().min(0).max(30),
  location_type: z.enum(["salon", "home", "both"]),
  eligible_age_group: z.enum(["all", "adults", "children"]),
  eligibility_notes: z.string().trim().max(1000).default(""),
  available_days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  is_featured: z.boolean(),
  is_public: z.boolean(),
  display_order: z.coerce.number().int().min(0).max(999),
  subscriber_limit: z.coerce.number().int().min(1).max(100000).nullable(),
  terms: z.string().trim().max(3000).default(""),
  included_service_ids: z.array(z.string().uuid()),
  status: z.enum(["draft", "active", "hidden", "closed"]),
});

export async function savePlan(
  planId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const limitRaw = String(formData.get("subscriber_limit") ?? "").trim();
  const parsed = planSchema.safeParse({
    category_id: formData.get("category_id"),
    name: formData.get("name"),
    plan_code: formData.get("plan_code"),
    tier_label: formData.get("tier_label") ?? "",
    short_description: formData.get("short_description") ?? "",
    full_description: formData.get("full_description") ?? "",
    monthly_price_naira: formData.get("monthly_price_naira"),
    visits_included: formData.get("visits_included"),
    min_visit_interval_days: formData.get("min_visit_interval_days") ?? 7,
    location_type: formData.get("location_type"),
    eligible_age_group: formData.get("eligible_age_group"),
    eligibility_notes: formData.get("eligibility_notes") ?? "",
    available_days: formData.getAll("available_days"),
    is_featured: formData.get("is_featured") === "on",
    is_public: formData.get("is_public") === "on",
    display_order: formData.get("display_order") ?? 0,
    subscriber_limit: limitRaw === "" ? null : limitRaw,
    terms: formData.get("terms") ?? "",
    included_service_ids: formData.getAll("included_service_ids"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { included_service_ids, monthly_price_naira, ...rest } = parsed.data;

  const supabase = await createClient();
  const row = {
    ...rest,
    monthly_price_kobo: Math.round(monthly_price_naira * 100),
  };

  let id = planId;
  if (id) {
    const { error } = await supabase.from("subscription_plans").update(row).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data: org } = await supabase.from("organisations").select("id").limit(1);
    const { data, error } = await supabase
      .from("subscription_plans")
      .insert({ ...row, slug: slugify(row.name), organisation_id: org?.[0]?.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  }

  // Sync included services (simple replace).
  await supabase.from("subscription_plan_services").delete().eq("plan_id", id);
  if (included_service_ids.length > 0) {
    await supabase.from("subscription_plan_services").insert(
      included_service_ids.map((sid) => ({
        plan_id: id,
        service_id: sid,
        relation: "included",
      })),
    );
  }

  revalidatePath("/admin/plans");
  redirect("/admin/plans");
}

export async function setPlanStatus(
  planId: string,
  status: "draft" | "active" | "hidden" | "closed" | "archived",
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("subscription_plans")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", planId);
  await supabase.rpc("write_audit", {
    p_action: `plan.status.${status}`,
    p_entity_type: "subscription_plan",
    p_entity_id: planId,
  });
  revalidatePath("/admin/plans");
}

export async function duplicatePlan(planId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (!plan) return;
  const copySuffix = `-copy-${Math.random().toString(36).slice(2, 6)}`;
  const { data: created } = await supabase
    .from("subscription_plans")
    .insert({
      ...plan,
      id: undefined,
      slug: plan.slug + copySuffix,
      plan_code: plan.plan_code + copySuffix.toUpperCase(),
      name: `${plan.name} (copy)`,
      status: "draft",
      created_at: undefined,
      updated_at: undefined,
      archived_at: null,
    })
    .select("id")
    .single();
  if (created) {
    const { data: rels } = await supabase
      .from("subscription_plan_services")
      .select("*")
      .eq("plan_id", planId);
    if (rels && rels.length > 0) {
      await supabase.from("subscription_plan_services").insert(
        rels.map((r) => ({ ...r, plan_id: created.id })),
      );
    }
  }
  revalidatePath("/admin/plans");
}

export async function movePlan(planId: string, direction: -1 | 1): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("id, display_order")
    .is("archived_at", null)
    .order("display_order");
  if (!plans) return;
  const idx = plans.findIndex((p) => p.id === planId);
  const swap = plans[idx + direction];
  if (idx < 0 || !swap) return;
  await supabase.from("subscription_plans").update({ display_order: swap.display_order }).eq("id", planId);
  await supabase.from("subscription_plans").update({ display_order: plans[idx].display_order }).eq("id", swap.id);
  revalidatePath("/admin/plans");
}

/* ------------------------------------------------------------- services --- */

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().max(60).default("general"),
  estimated_duration_minutes: z.coerce.number().int().min(5).max(600),
  eligible_age_group: z.enum(["all", "adults", "children"]),
  salon_available: z.boolean(),
  home_available: z.boolean(),
  required_skill: z.string().trim().max(60).nullable(),
  display_order: z.coerce.number().int().min(0).max(999),
  is_active: z.boolean(),
});

export async function saveService(
  serviceId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const skill = String(formData.get("required_skill") ?? "").trim();
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    category: formData.get("category") || "general",
    estimated_duration_minutes: formData.get("estimated_duration_minutes"),
    eligible_age_group: formData.get("eligible_age_group"),
    salon_available: formData.get("salon_available") === "on",
    home_available: formData.get("home_available") === "on",
    required_skill: skill === "" ? null : skill,
    display_order: formData.get("display_order") ?? 0,
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  if (serviceId) {
    const { error } = await supabase.from("services").update(parsed.data).eq("id", serviceId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("services")
      .insert({ ...parsed.data, slug: slugify(parsed.data.name) });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/services");
  return { success: "Service saved." };
}

export async function archiveService(serviceId: string, archive: boolean): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("services")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: !archive,
    })
    .eq("id", serviceId);
  revalidatePath("/admin/services");
}

/* -------------------------------------------------------- extra services -- */

const extraSchema = z.object({
  name: z.string().trim().min(2).max(80),
  short_description: z.string().trim().max(300).default(""),
  description: z.string().trim().max(2000).default(""),
  price_naira: z.coerce.number().min(0).max(10_000_000),
  estimated_duration_minutes: z.coerce.number().int().min(5).max(480),
  min_advance_notice_hours: z.coerce.number().int().min(0).max(336),
  payment_requirement: z.enum(["pay_before_confirmation", "pay_at_salon", "admin_decides"]),
  salon_available: z.boolean(),
  home_available: z.boolean(),
  is_active: z.boolean(),
  is_public: z.boolean(),
  is_featured: z.boolean(),
  display_order: z.coerce.number().int().min(0).max(999),
  eligible_plan_ids: z.array(z.string().uuid()),
  eligible_category_ids: z.array(z.string().uuid()),
});

export async function saveExtraService(
  extraId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = extraSchema.safeParse({
    name: formData.get("name"),
    short_description: formData.get("short_description") ?? "",
    description: formData.get("description") ?? "",
    price_naira: formData.get("price_naira"),
    estimated_duration_minutes: formData.get("estimated_duration_minutes"),
    min_advance_notice_hours: formData.get("min_advance_notice_hours") ?? 0,
    payment_requirement: formData.get("payment_requirement"),
    salon_available: formData.get("salon_available") === "on",
    home_available: formData.get("home_available") === "on",
    is_active: formData.get("is_active") === "on",
    is_public: formData.get("is_public") === "on",
    is_featured: formData.get("is_featured") === "on",
    display_order: formData.get("display_order") ?? 0,
    eligible_plan_ids: formData.getAll("eligible_plan_ids"),
    eligible_category_ids: formData.getAll("eligible_category_ids"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price_naira, eligible_plan_ids, eligible_category_ids, ...rest } = parsed.data;

  const supabase = await createClient();
  const row = { ...rest, price_kobo: Math.round(price_naira * 100) };

  let id = extraId;
  if (id) {
    const { error } = await supabase.from("extra_services").update(row).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("extra_services")
      .insert({ ...row, slug: slugify(row.name) })
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  }

  await supabase.from("extra_service_plan_eligibility").delete().eq("extra_service_id", id);
  await supabase.from("extra_service_customer_eligibility").delete().eq("extra_service_id", id);
  if (eligible_plan_ids.length > 0) {
    await supabase.from("extra_service_plan_eligibility").insert(
      eligible_plan_ids.map((pid) => ({ extra_service_id: id, plan_id: pid })),
    );
  }
  if (eligible_category_ids.length > 0) {
    await supabase.from("extra_service_customer_eligibility").insert(
      eligible_category_ids.map((cid) => ({ extra_service_id: id, category_id: cid })),
    );
  }
  revalidatePath("/admin/extra-services");
  redirect("/admin/extra-services");
}

export async function archiveExtraService(extraId: string, archive: boolean): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("extra_services")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: !archive,
    })
    .eq("id", extraId);
  revalidatePath("/admin/extra-services");
}

/* -------------------------------------------------------------- products -- */

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(60),
  short_description: z.string().trim().max(300).default(""),
  full_description: z.string().trim().max(5000).default(""),
  category_id: z.string().uuid().nullable(),
  price_naira: z.coerce.number().min(0).max(10_000_000),
  subscriber_price_naira: z.coerce.number().min(0).max(10_000_000).nullable(),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock"]),
  age_suitability: z.enum(["all", "adults", "children"]),
  hair_type_suitability: z.string().trim().max(200).default(""),
  usage_instructions: z.string().trim().max(3000).default(""),
  ingredients: z.string().trim().max(3000).default(""),
  warnings: z.string().trim().max(1000).default(""),
  is_active: z.boolean(),
  is_featured: z.boolean(),
  display_order: z.coerce.number().int().min(0).max(999),
});

export async function saveProduct(
  productId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const subPriceRaw = String(formData.get("subscriber_price_naira") ?? "").trim();
  const catRaw = String(formData.get("category_id") ?? "").trim();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    short_description: formData.get("short_description") ?? "",
    full_description: formData.get("full_description") ?? "",
    category_id: catRaw === "" ? null : catRaw,
    price_naira: formData.get("price_naira"),
    subscriber_price_naira: subPriceRaw === "" ? null : subPriceRaw,
    stock_status: formData.get("stock_status"),
    age_suitability: formData.get("age_suitability"),
    hair_type_suitability: formData.get("hair_type_suitability") ?? "",
    usage_instructions: formData.get("usage_instructions") ?? "",
    ingredients: formData.get("ingredients") ?? "",
    warnings: formData.get("warnings") ?? "",
    is_active: formData.get("is_active") === "on",
    is_featured: formData.get("is_featured") === "on",
    display_order: formData.get("display_order") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price_naira, subscriber_price_naira, ...rest } = parsed.data;
  const invRaw = String(formData.get("inventory_item_id") ?? "").trim();
  const row = {
    ...rest,
    price_kobo: Math.round(price_naira * 100),
    subscriber_price_kobo:
      subscriber_price_naira == null ? null : Math.round(subscriber_price_naira * 100),
    inventory_item_id: invRaw === "" ? null : invRaw,
  };

  const supabase = await createClient();
  if (productId) {
    const { error } = await supabase.from("products").update(row).eq("id", productId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("products")
      .insert({ ...row, slug: slugify(row.name) });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function archiveProduct(productId: string, archive: boolean): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("products")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: !archive,
    })
    .eq("id", productId);
  revalidatePath("/admin/products");
}

/* ---------------------------------------------------- booking operations -- */

function bookingError(message: string): string {
  if (/ALREADY_COMPLETED/.test(message)) return "This appointment is already completed.";
  if (/STATE:/.test(message)) return "That change is not allowed from the current status.";
  if (/SKILL:/.test(message)) return "This stylist lacks the required skill for the service.";
  if (/no_stylist_double_booking|exclusion/.test(message))
    return "The stylist already has an overlapping appointment.";
  if (/permission denied/.test(message)) return "You do not have permission for this action.";
  return message;
}

export async function adminSetAppointmentStatus(
  appointmentId: string,
  status: "confirmed" | "arrived" | "in_service",
  reason = "",
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_set_appointment_status", {
    p_appointment_id: appointmentId,
    p_new_status: status,
    p_reason: reason,
  });
  if (error) return { error: bookingError(error.message) };
  revalidatePath(`/admin/bookings`);
  return { success: "Updated." };
}

export async function adminCompleteAppointment(appointmentId: string): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_complete_appointment", {
    p_appointment_id: appointmentId,
  });
  if (error) return { error: bookingError(error.message) };
  revalidatePath(`/admin/bookings`);
  return { success: "Appointment completed — visit consumed." };
}

export async function adminReleaseAppointment(
  appointmentId: string,
  status: "missed" | "cancelled_salon" | "cancelled_admin",
  reason: string,
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_release_appointment", {
    p_appointment_id: appointmentId,
    p_new_status: status,
    p_reason: reason,
  });
  if (error) return { error: bookingError(error.message) };
  revalidatePath(`/admin/bookings`);
  return { success: "Updated — the reserved visit was released back to the customer." };
}

export async function adminAssignStylist(
  appointmentId: string,
  stylistProfileId: string,
  reason = "",
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_assign_stylist", {
    p_appointment_id: appointmentId,
    p_stylist_profile_id: stylistProfileId,
    p_reason: reason,
  });
  if (error) return { error: bookingError(error.message) };
  revalidatePath(`/admin/bookings`);
  return { success: "Stylist assigned." };
}

export async function adminAddInternalNote(
  appointmentId: string,
  note: string,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  if (note.trim().length === 0) return { error: "Note cannot be empty." };
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_internal_notes").insert({
    appointment_id: appointmentId,
    author_profile_id: session.userId,
    note: note.trim(),
  });
  if (error) return { error: "Could not save note." };
  revalidatePath(`/admin/bookings/${appointmentId}`);
  return { success: "Note added." };
}

/* --------------------------------------------------- customer management -- */

export async function adminAddCustomerNote(
  customerId: string,
  note: string,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  if (note.trim().length === 0) return { error: "Note cannot be empty." };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_internal_notes").insert({
    customer_id: customerId,
    author_profile_id: session.userId,
    note: note.trim(),
  });
  if (error) return { error: "Could not save note (permission required)." };
  revalidatePath(`/admin/customers/${customerId}`);
  return { success: "Note added." };
}

export async function adminAssignTag(
  customerId: string,
  tagName: string,
): Promise<ActionState> {
  const session = await requireAdmin();
  const name = tagName.trim().toLowerCase();
  if (!name) return { error: "Tag cannot be empty." };
  const supabase = await createClient();
  let { data: tag } = await supabase
    .from("customer_tags")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (!tag) {
    const { data: created, error } = await supabase
      .from("customer_tags")
      .insert({ name })
      .select("id")
      .single();
    if (error) return { error: "Could not create tag." };
    tag = created;
  }
  await supabase.from("customer_tag_assignments").upsert({
    customer_id: customerId,
    tag_id: tag.id,
    assigned_by: session.userId,
  });
  revalidatePath(`/admin/customers/${customerId}`);
  return { success: "Tag added." };
}

export async function adminRemoveTag(customerId: string, tagId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("customer_tag_assignments")
    .delete()
    .eq("customer_id", customerId)
    .eq("tag_id", tagId);
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function adminActivateSubscription(
  customerId: string,
  planId: string,
  childId: string | null,
  reason: string,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_activate_manual_subscription", {
    p_customer_id: customerId,
    p_plan_id: planId,
    p_child_id: childId,
    p_reason: reason || "manual activation",
  });
  if (error) {
    if (/already has an active/.test(error.message)) {
      return { error: "This recipient already has an active subscription." };
    }
    return { error: error.message };
  }
  revalidatePath(`/admin/customers/${customerId}`);
  return { success: "Subscription activated (manual/test)." };
}

export async function adminAdjustVisits(
  customerId: string,
  cycleId: string,
  delta: number,
  reason: string,
): Promise<ActionState> {
  await requireAdmin();
  if (!reason.trim()) return { error: "A reason is required for visit adjustments." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_adjust_visit_balance", {
    p_cycle_id: cycleId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) {
    if (/NO_VISITS/.test(error.message))
      return { error: "Not enough available visits to remove." };
    if (/REASON_REQUIRED/.test(error.message))
      return { error: "A reason is required for visit adjustments." };
    return { error: error.message };
  }
  revalidatePath(`/admin/customers/${customerId}`);
  return { success: "Visit balance adjusted and audited." };
}

export async function adminArchiveCustomer(
  customerId: string,
  archive: boolean,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_profiles")
    .update({
      account_status: archive ? "archived" : "active",
      archived_at: archive ? new Date().toISOString() : null,
    })
    .eq("id", customerId);
  if (error) return { error: error.message };
  await supabase.rpc("write_audit", {
    p_action: archive ? "customer.archive" : "customer.restore",
    p_entity_type: "customer_profile",
    p_entity_id: customerId,
  });
  revalidatePath(`/admin/customers`);
  return { success: archive ? "Customer archived." : "Customer restored." };
}

/* ------------------------------------------------------------- settings --- */

export async function saveSchedulingSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({
    slot_duration_minutes: z.coerce.number().refine((v) => [15, 20, 30, 45, 60].includes(v)),
    max_bookings_per_slot: z.coerce.number().int().min(1).max(20),
    min_booking_notice_hours: z.coerce.number().int().min(0).max(168),
    max_advance_booking_days: z.coerce.number().int().min(1).max(180),
    reschedule_deadline_hours: z.coerce.number().int().min(0).max(168),
    home_service_capacity_per_day: z.coerce.number().int().min(0).max(50),
    supported_service_areas: z.string().trim(),
  });
  const parsed = schema.safeParse({
    slot_duration_minutes: formData.get("slot_duration_minutes"),
    max_bookings_per_slot: formData.get("max_bookings_per_slot"),
    min_booking_notice_hours: formData.get("min_booking_notice_hours"),
    max_advance_booking_days: formData.get("max_advance_booking_days"),
    reschedule_deadline_hours: formData.get("reschedule_deadline_hours"),
    home_service_capacity_per_day: formData.get("home_service_capacity_per_day"),
    supported_service_areas: formData.get("supported_service_areas") ?? "ilorin",
  });
  if (!parsed.success) return { error: "Check the settings values." };
  const { supported_service_areas, ...rest } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduling_settings")
    .update({
      ...rest,
      supported_service_areas: supported_service_areas
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Settings saved." };
}

export async function saveBusinessHours(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  for (let d = 0; d <= 6; d++) {
    const isOpen = formData.get(`open_${d}`) === "on";
    const open = String(formData.get(`open_time_${d}`) ?? "09:00");
    const close = String(formData.get(`close_time_${d}`) ?? "18:00");
    if (isOpen && close <= open) {
      return { error: "Closing time must be after opening time." };
    }
    const { error } = await supabase
      .from("business_hours")
      .update({ is_open: isOpen, open_time: open, close_time: close })
      .eq("day_of_week", d);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { success: "Business hours saved." };
}

export async function addBlackoutDate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 200);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackout_dates")
    .insert({ date, reason, is_full_day: true });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Blackout date added." };
}

export async function removeBlackoutDate(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("blackout_dates").delete().eq("id", id);
  revalidatePath("/admin/settings");
}

/* ------------------------------------------------------ consultations ----- */

export async function setConsultationBookingStatus(
  bookingId: string,
  status: "pending_confirmation" | "confirmed" | "completed" | "cancelled",
): Promise<void> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("consultation_bookings")
    .update({ status })
    .eq("id", bookingId);
  revalidatePath("/admin/consultations");
}

/* ---------------------------------------------------- recommendations ----- */

export async function saveRecommendationRule(
  ruleId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    context: z.enum([
      "plan_detail", "booking", "booking_confirmation",
      "upcoming_appointment", "post_appointment", "product_catalogue",
    ]),
    badge_label: z.string().trim().max(60).nullable(),
    priority: z.coerce.number().int().min(0).max(999),
    is_active: z.boolean(),
    target_plan_id: z.string().uuid().nullable(),
    item_extra_ids: z.array(z.string().uuid()),
    item_product_ids: z.array(z.string().uuid()),
  });
  const badge = String(formData.get("badge_label") ?? "").trim();
  const targetPlan = String(formData.get("target_plan_id") ?? "").trim();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    context: formData.get("context"),
    badge_label: badge === "" ? null : badge,
    priority: formData.get("priority") ?? 0,
    is_active: formData.get("is_active") === "on",
    target_plan_id: targetPlan === "" ? null : targetPlan,
    item_extra_ids: formData.getAll("item_extra_ids"),
    item_product_ids: formData.getAll("item_product_ids"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.item_extra_ids.length + d.item_product_ids.length === 0) {
    return { error: "Pick at least one item to recommend." };
  }

  const supabase = await createClient();
  let id = ruleId;
  const row = {
    name: d.name,
    context: d.context,
    badge_label: d.badge_label,
    priority: d.priority,
    is_active: d.is_active,
  };
  if (id) {
    const { error } = await supabase.from("recommendation_rules").update(row).eq("id", id);
    if (error) return { error: error.message };
    await supabase.from("recommendation_targets").delete().eq("rule_id", id);
    await supabase.from("recommendation_items").delete().eq("rule_id", id);
  } else {
    const { data, error } = await supabase
      .from("recommendation_rules")
      .insert(row)
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  }

  await supabase.from("recommendation_targets").insert(
    d.target_plan_id
      ? [{ rule_id: id, target_type: "plan", target_id: d.target_plan_id }]
      : [{ rule_id: id, target_type: "all", target_id: null }],
  );
  const items = [
    ...d.item_extra_ids.map((iid, i) => ({
      rule_id: id, item_type: "extra_service", item_id: iid, display_order: i,
    })),
    ...d.item_product_ids.map((iid, i) => ({
      rule_id: id, item_type: "product", item_id: iid,
      display_order: d.item_extra_ids.length + i,
    })),
  ];
  await supabase.from("recommendation_items").insert(items);
  revalidatePath("/admin/recommendations");
  redirect("/admin/recommendations");
}

export async function deleteRecommendationRule(ruleId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("recommendation_rules").delete().eq("id", ruleId);
  revalidatePath("/admin/recommendations");
}
