"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireCustomer, requireStaffOrAdmin } from "@/server/auth";

export interface ActionState {
  error?: string;
  success?: string;
}

function friendly(message: string): string {
  const map: Array<[RegExp, string]> = [
    [/NEGATIVE_STOCK/, "Not enough stock — the movement would go below zero."],
    [/STOCK_GUARD/, "Quantities can only change through stock movements."],
    [/LEDGER_IMMUTABLE/, "Stock movements cannot be edited or deleted."],
    [/ALREADY_POSTED/, "This was already posted — nothing was changed again."],
    [/REASON_REQUIRED/, "A reason is required for this change."],
    [/SELF_APPROVAL/, "You cannot approve your own record — ask another approver."],
    [/THRESHOLD/, "This amount needs admin approval."],
    [/EXPENSE_LOCKED/, "Submitted expenses can only change through the approval workflow."],
    [/CAPACITY_FULL/, message.replace(/^.*CAPACITY_FULL: /, "Capacity full: ")],
    [/CLOSED:/, "This conversation is closed — start a new one."],
    [/STATE:/, "That change is not allowed from the current status."],
    [/permission denied/, "You do not have permission for this action."],
  ];
  for (const [re, out] of map) if (re.test(message)) return out;
  return message;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ------------------------------------------------------- inventory items -- */

const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(60),
  barcode: z.string().trim().max(60).default(""),
  item_type: z.enum(["consumable", "retail", "equipment"]),
  category_id: z.string().uuid().nullable(),
  unit: z.string().trim().min(1).max(20),
  reorder_level: z.coerce.number().min(0),
  reorder_quantity: z.coerce.number().min(0),
  cost_price_naira: z.coerce.number().min(0),
  selling_price_naira: z.coerce.number().min(0).nullable(),
  supplier_id: z.string().uuid().nullable(),
  storage_location: z.string().trim().max(120).default(""),
  expiry_date: z.string().nullable(),
  retail_available: z.boolean(),
  salon_use_available: z.boolean(),
  is_active: z.boolean(),
  description: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export async function saveInventoryItem(
  itemId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  const opt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode") ?? "",
    item_type: formData.get("item_type"),
    category_id: opt("category_id"),
    unit: formData.get("unit"),
    reorder_level: formData.get("reorder_level") ?? 0,
    reorder_quantity: formData.get("reorder_quantity") ?? 0,
    cost_price_naira: formData.get("cost_price_naira") ?? 0,
    selling_price_naira: opt("selling_price_naira"),
    supplier_id: opt("supplier_id"),
    storage_location: formData.get("storage_location") ?? "",
    expiry_date: opt("expiry_date"),
    retail_available: formData.get("retail_available") === "on",
    salon_use_available: formData.get("salon_use_available") === "on",
    is_active: formData.get("is_active") === "on",
    description: formData.get("description") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { cost_price_naira, selling_price_naira, ...rest } = parsed.data;
  const row = {
    ...rest,
    cost_price_kobo: Math.round(cost_price_naira * 100),
    selling_price_kobo:
      selling_price_naira == null ? null : Math.round(selling_price_naira * 100),
    updated_by: session.userId,
  };

  const supabase = await createClient();
  if (itemId) {
    const { error } = await supabase.from("inventory_items").update(row).eq("id", itemId);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data: org } = await supabase.from("organisations").select("id").limit(1);
    const { error } = await supabase.from("inventory_items").insert({
      ...row,
      organisation_id: org?.[0]?.id,
      created_by: session.userId,
    });
    if (error) return { error: friendly(error.message) };
  }
  revalidatePath("/admin/inventory");
  return { success: "Item saved." };
}

export async function postStockMovement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const itemId = String(formData.get("item_id"));
  const type = String(formData.get("movement_type"));
  const qty = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!qty || Number.isNaN(qty)) return { error: "Enter a quantity." };
  if (!reason) return { error: "A reason is required for manual movements." };
  const outward = ["salon_usage", "retail_sale", "damage", "expired_stock",
    "theft_or_loss", "return_to_supplier", "transfer"].includes(type);
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_post_stock_movement", {
    p_item_id: itemId,
    p_movement_type: type,
    p_quantity: outward ? -Math.abs(qty) : Math.abs(qty),
    p_reason: reason,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory");
  return { success: "Movement posted." };
}

export async function saveInventoryCategory(
  categoryId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter a category name." };
  const row = {
    name,
    display_order: Number(formData.get("display_order") ?? 0),
    is_active: formData.get("is_active") === "on",
  };
  const supabase = await createClient();
  const { error } = categoryId
    ? await supabase.from("inventory_categories").update(row).eq("id", categoryId)
    : await supabase.from("inventory_categories").insert({ ...row, slug: slugify(name) });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory/categories");
  return { success: "Category saved." };
}

export async function addInventoryUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Enter a unit name." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_units")
    .insert({ code: slugify(label), label });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory");
  return { success: "Unit added." };
}

/* ------------------------------------------------------------- receiving -- */

export async function createStockReceipt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;
  const invoice = String(formData.get("invoice_number") ?? "").trim();
  const itemIds = formData.getAll("item_id").map(String);
  const quantities = formData.getAll("qty").map(Number);
  const costs = formData.getAll("unit_cost").map(Number);
  const lines = itemIds
    .map((id, i) => ({ item_id: id, quantity: quantities[i], unit_cost: costs[i] || 0 }))
    .filter((l) => l.item_id && l.quantity > 0);
  if (lines.length === 0) return { error: "Add at least one item with a quantity." };

  const supabase = await createClient();
  const { data: receipt, error } = await supabase
    .from("stock_receipts")
    .insert({
      supplier_id: supplierId,
      invoice_number: invoice,
      payment_status: String(formData.get("payment_status") ?? "unpaid"),
      notes: String(formData.get("notes") ?? ""),
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  const { error: e2 } = await supabase.from("stock_receipt_items").insert(
    lines.map((l) => ({
      receipt_id: receipt.id,
      item_id: l.item_id,
      quantity: l.quantity,
      unit_cost_kobo: Math.round(l.unit_cost * 100),
    })),
  );
  if (e2) return { error: friendly(e2.message) };
  revalidatePath("/admin/inventory/receiving");
  return { success: "Draft receipt created — confirm it to update stock." };
}

export async function confirmStockReceipt(receiptId: string): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirm_stock_receipt", {
    p_receipt_id: receiptId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory/receiving");
  return { success: "Receipt confirmed — stock updated." };
}

export async function cancelStockReceipt(receiptId: string): Promise<void> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("stock_receipts")
    .update({ status: "cancelled" })
    .eq("id", receiptId)
    .eq("status", "draft");
  revalidatePath("/admin/inventory/receiving");
}

/* ----------------------------------------------------------- stock counts -- */

export async function createStockCount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  const itemIds = formData.getAll("item_id").map(String);
  const counted = formData.getAll("counted").map((v) => String(v).trim());
  const reasons = formData.getAll("count_reason").map(String);
  const supabase = await createClient();

  const lines: Array<{ item_id: string; counted: number; reason: string }> = [];
  for (let i = 0; i < itemIds.length; i++) {
    if (counted[i] === "") continue;
    lines.push({ item_id: itemIds[i], counted: Number(counted[i]), reason: reasons[i] ?? "" });
  }
  if (lines.length === 0) return { error: "Enter at least one counted quantity." };

  const { data: count, error } = await supabase
    .from("stock_counts")
    .insert({
      location: String(formData.get("location") ?? "salon"),
      started_by: session.userId,
      notes: String(formData.get("notes") ?? ""),
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, quantity_on_hand")
    .in("id", lines.map((l) => l.item_id));
  const { error: e2 } = await supabase.from("stock_count_items").insert(
    lines.map((l) => ({
      count_id: count.id,
      item_id: l.item_id,
      system_quantity: items?.find((i) => i.id === l.item_id)?.quantity_on_hand ?? 0,
      counted_quantity: l.counted,
      reason: l.reason,
    })),
  );
  if (e2) return { error: friendly(e2.message) };

  const { error: e3 } = await supabase.rpc("fn_submit_stock_count", {
    p_count_id: count.id,
  });
  if (e3) return { error: friendly(e3.message) };
  revalidatePath("/admin/inventory/counts");
  return { success: "Count submitted for approval." };
}

export async function reviewStockCount(
  countId: string,
  approve: boolean,
  reason: string,
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_review_stock_count", {
    p_count_id: countId,
    p_approve: approve,
    p_reason: reason,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory/counts");
  return { success: approve ? "Count approved — adjustments posted." : "Count rejected." };
}

/* --------------------------------------------------------------- suppliers -- */

export async function saveSupplier(
  supplierId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter the supplier name." };
  const row = {
    name,
    contact_person: String(formData.get("contact_person") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    whatsapp_number: String(formData.get("whatsapp_number") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    categories_supplied: String(formData.get("categories_supplied") ?? ""),
    payment_terms: String(formData.get("payment_terms") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    is_active: formData.get("is_active") === "on",
  };
  const supabase = await createClient();
  let id = supplierId;
  if (id) {
    const { error } = await supabase.from("suppliers").update(row).eq("id", id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase.from("suppliers").insert(row).select("id").single();
    if (error) return { error: friendly(error.message) };
    id = data.id;
  }
  const bank = String(formData.get("bank_details") ?? "").trim();
  if (bank) {
    await supabase.from("supplier_bank_details").upsert({ supplier_id: id, bank_details: bank });
  }
  revalidatePath("/admin/suppliers");
  return { success: "Supplier saved." };
}

/* --------------------------------------------------------------- equipment -- */

export async function saveEquipment(
  assetId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const opt = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    asset_code: String(formData.get("asset_code") ?? "").trim(),
    category_id: opt("category_id"),
    purchase_date: opt("purchase_date"),
    purchase_cost_kobo: Math.round(Number(formData.get("purchase_cost_naira") ?? 0) * 100),
    supplier_id: opt("supplier_id"),
    condition: String(formData.get("condition") ?? "good"),
    location: String(formData.get("location") ?? "salon"),
    assigned_staff_id: opt("assigned_staff_id"),
    warranty_expiry: opt("warranty_expiry"),
    maintenance_interval_days: formData.get("maintenance_interval_days")
      ? Number(formData.get("maintenance_interval_days")) : null,
    last_maintenance_date: opt("last_maintenance_date"),
    notes: String(formData.get("notes") ?? ""),
    is_active: formData.get("is_active") === "on",
  };
  if (row.name.length < 2 || row.asset_code.length < 2) {
    return { error: "Name and asset code are required." };
  }
  const supabase = await createClient();
  const { error } = assetId
    ? await supabase.from("equipment_assets").update(row).eq("id", assetId)
    : await supabase.from("equipment_assets").insert(row);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/equipment");
  return { success: "Equipment saved." };
}

export async function addEquipmentLog(
  assetId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Describe the work done." };
  const supabase = await createClient();
  const { error } = await supabase.from("equipment_logs").insert({
    asset_id: assetId,
    log_type: String(formData.get("log_type") ?? "maintenance"),
    description,
    cost_kobo: Math.round(Number(formData.get("cost_naira") ?? 0) * 100),
    performed_by: session.userId,
  });
  if (error) return { error: friendly(error.message) };
  if (formData.get("log_type") === "maintenance") {
    await supabase
      .from("equipment_assets")
      .update({ last_maintenance_date: new Date().toISOString().slice(0, 10) })
      .eq("id", assetId);
  }
  revalidatePath("/admin/equipment");
  return { success: "Log added." };
}

/* ---------------------------------------------------------------- expenses -- */

export async function saveExpense(
  expenseId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  const amount = Number(formData.get("amount_naira") ?? 0);
  const categoryId = String(formData.get("category_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (amount <= 0) return { error: "Enter an amount above zero." };
  if (!description) return { error: "Describe the expense." };
  const opt = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const row = {
    expense_date: String(formData.get("expense_date") ?? new Date().toISOString().slice(0, 10)),
    amount_kobo: Math.round(amount * 100),
    category_id: categoryId,
    subcategory: String(formData.get("subcategory") ?? ""),
    description,
    payee: String(formData.get("payee") ?? ""),
    payment_method: String(formData.get("payment_method") ?? "transfer"),
    location: String(formData.get("location") ?? "salon"),
    supplier_id: opt("supplier_id"),
    reference_number: String(formData.get("reference_number") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  const supabase = await createClient();
  const { error } = expenseId
    ? await supabase.from("expenses").update(row).eq("id", expenseId).eq("status", "draft")
    : await (async () => {
        const { data: org } = await supabase.from("organisations").select("id").limit(1);
        return supabase.from("expenses").insert({
          ...row,
          organisation_id: org?.[0]?.id,
          entered_by: session.userId,
        });
      })();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses");
  return { success: "Expense saved as draft." };
}

export async function expenseTransition(
  expenseId: string,
  action: "submit" | "approve" | "reject" | "mark_paid" | "void",
  reason = "",
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_expense_transition", {
    p_expense_id: expenseId,
    p_action: action,
    p_reason: reason,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses");
  return { success: "Updated." };
}

export async function saveRecurringTemplate(
  templateId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const amount = Number(formData.get("amount_naira") ?? 0);
  if (amount <= 0) return { error: "Enter an amount." };
  const row = {
    category_id: String(formData.get("category_id")),
    description: String(formData.get("description") ?? "").trim(),
    amount_kobo: Math.round(amount * 100),
    frequency: String(formData.get("frequency") ?? "monthly"),
    start_date: String(formData.get("start_date") ?? new Date().toISOString().slice(0, 10)),
    next_due_date: String(formData.get("next_due_date") ?? new Date().toISOString().slice(0, 10)),
    vendor: String(formData.get("vendor") ?? ""),
    payment_method: String(formData.get("payment_method") ?? "transfer"),
    is_active: formData.get("is_active") === "on",
  };
  if (!row.description) return { error: "Describe the recurring expense." };
  const supabase = await createClient();
  const { error } = templateId
    ? await supabase.from("recurring_expense_templates").update(row).eq("id", templateId)
    : await supabase.from("recurring_expense_templates").insert(row);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses/recurring");
  return { success: "Template saved." };
}

export async function generateRecurringNow(): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_generate_recurring_expenses");
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses");
  return { success: `${data ?? 0} draft expense(s) created from due templates.` };
}

/* ------------------------------------------------------------ consumption -- */

export async function postAppointmentConsumption(
  appointmentId: string,
  items: Array<{ item_id: string; planned: number; actual: number; reason: string | null }>,
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_post_appointment_consumption", {
    p_appointment_id: appointmentId,
    p_items: items,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/bookings/${appointmentId}`);
  return { success: "Inventory usage recorded." };
}

/* ------------------------------------------------------------ support chat -- */

export async function startConversation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomer();
  const subject = String(formData.get("subject") ?? "").trim();
  const topic = String(formData.get("topic") ?? "general");
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 3) return { error: "Give your question a short subject." };
  if (body.length < 3) return { error: "Write your message." };
  const supabase = await createClient();
  const { data: conv, error } = await supabase
    .from("support_conversations")
    .insert({ customer_id: session.customerProfile.id, subject, topic })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  const { error: e2 } = await supabase.from("support_messages").insert({
    conversation_id: conv.id,
    sender_profile_id: session.userId,
    sender_type: "customer",
    body,
  });
  if (e2) return { error: friendly(e2.message) };
  redirect(`/app/support/${conv.id}`);
}

export async function sendCustomerMessage(
  conversationId: string,
  body: string,
): Promise<ActionState> {
  const session = await requireCustomer();
  if (body.trim().length === 0) return { error: "Write a message first." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({
    conversation_id: conversationId,
    sender_profile_id: session.userId,
    sender_type: "customer",
    body: body.trim().slice(0, 5000),
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/app/support/${conversationId}`);
  return {};
}

export async function markConversationRead(
  conversationId: string,
  side: "customer" | "staff",
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("support_conversations")
    .update(
      side === "customer"
        ? { customer_last_read_at: new Date().toISOString() }
        : { staff_last_read_at: new Date().toISOString() },
    )
    .eq("id", conversationId);
}

export async function customerResolveConversation(
  conversationId: string,
  reopen: boolean,
): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("support_conversations")
    .update(
      reopen
        ? { status: "waiting_salon", resolved_at: null }
        : { status: "resolved", resolved_at: new Date().toISOString() },
    )
    .eq("id", conversationId);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/app/support/${conversationId}`);
  return {};
}

export async function sendStaffMessage(
  conversationId: string,
  body: string,
  isInternalNote: boolean,
): Promise<ActionState> {
  const session = await requireStaffOrAdmin();
  if (body.trim().length === 0) return { error: "Write a message first." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({
    conversation_id: conversationId,
    sender_profile_id: session.userId,
    sender_type: "staff",
    body: body.trim().slice(0, 5000),
    is_internal_note: isInternalNote,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/support/${conversationId}`);
  return {};
}

export async function updateConversation(
  conversationId: string,
  patch: {
    status?: string;
    priority?: string;
    assigned_staff_id?: string | null;
  },
): Promise<ActionState> {
  await requireStaffOrAdmin();
  const supabase = await createClient();
  const update: Record<string, unknown> = { ...patch };
  if (patch.status === "resolved") update.resolved_at = new Date().toISOString();
  if (patch.status === "closed") update.closed_at = new Date().toISOString();
  if (patch.assigned_staff_id) update.status = "assigned";
  const { error } = await supabase
    .from("support_conversations")
    .update(update)
    .eq("id", conversationId);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/support");
  return { success: "Updated." };
}

export async function saveSavedReply(
  replyId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "Title and body are required." };
  const supabase = await createClient();
  const { error } = replyId
    ? await supabase.from("support_saved_replies").update({ title, body }).eq("id", replyId)
    : await supabase.from("support_saved_replies").insert({ title, body });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/support/replies");
  return { success: "Saved reply stored." };
}

/* ---------------------------------------------------------------- capacity -- */

export async function saveCapacitySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_capacity_settings")
    .update({
      global_active_subscriber_limit: num("global_limit"),
      home_service_subscriber_limit: num("home_limit"),
      max_promised_visits_per_cycle: num("max_visits"),
      warning_threshold_percent: Number(formData.get("warning_threshold") ?? 80),
      hard_stop_threshold_percent: Number(formData.get("hard_stop_threshold") ?? 100),
      enforce_hard_stop: formData.get("enforce_hard_stop") === "on",
    })
    .eq("id", true);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/capacity");
  return { success: "Capacity settings saved." };
}

/* --------------------------------------------------- consumption templates -- */

export async function saveConsumptionTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const serviceRef = String(formData.get("service_ref") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const qty = Number(formData.get("standard_quantity") ?? 0);
  if (!serviceRef || !itemId || qty <= 0) {
    return { error: "Pick a service, an item and a quantity." };
  }
  const [kind, refId] = serviceRef.split(":");
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items").select("unit").eq("id", itemId).single();
  const { error } = await supabase.from("service_consumption_templates").insert({
    service_id: kind === "service" ? refId : null,
    extra_service_id: kind === "extra" ? refId : null,
    item_id: itemId,
    standard_quantity: qty,
    unit: item?.unit ?? "piece",
    is_required: formData.get("is_required") === "on",
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory/templates");
  return { success: "Template line added." };
}

export async function deleteConsumptionTemplate(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("service_consumption_templates").delete().eq("id", id);
  revalidatePath("/admin/inventory/templates");
}

/* ---------------------------------------------------------------- settings -- */

export async function saveInventorySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_settings")
    .update({
      expiry_warning_days: Math.max(1, Number(formData.get("expiry_warning_days") ?? 30)),
      allow_negative_stock: formData.get("allow_negative_stock") === "on",
      high_value_adjustment_kobo:
        Math.max(0, Number(formData.get("high_value_adjustment_naira") ?? 0)) * 100,
    })
    .eq("id", true);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/inventory/settings");
  revalidatePath("/admin/inventory/alerts");
  return { success: "Inventory settings saved." };
}

export async function saveExpenseSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_settings")
    .update({
      approval_threshold_kobo:
        Math.max(0, Number(formData.get("approval_threshold_naira") ?? 0)) * 100,
    })
    .eq("id", true);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses/categories");
  return { success: "Expense settings saved." };
}

export async function saveExpenseCategory(
  categoryId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Category name is required." };
  const values = {
    name,
    display_order: Math.max(0, Number(formData.get("display_order") ?? 0)),
    is_active: formData.get("is_active") === "on",
  };
  const supabase = await createClient();
  const { error } = categoryId
    ? await supabase.from("expense_categories").update(values).eq("id", categoryId)
    : await supabase.from("expense_categories").insert(values);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/expenses/categories");
  return { success: "Expense category saved." };
}
