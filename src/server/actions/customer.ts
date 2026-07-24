"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/server/auth";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Translate SQL business errors (CODE: message) into friendly copy. */
function friendlyDbError(message: string): string {
  const known: Array<[RegExp, string]> = [
    [/PROFILE_INCOMPLETE/, "Please complete your profile before booking."],
    [/SUBSCRIPTION_INACTIVE/, "This subscription is not active."],
    [/RECIPIENT_MISMATCH/, "This subscription is not for the selected person."],
    [/SERVICE_UNAVAILABLE/, "That service is not available for this booking."],
    [/LOCATION_INELIGIBLE/, "That location is not available for this plan or service."],
    [/SERVICE_AREA/, "Home service is currently available only within Ilorin."],
    [/DAY_UNAVAILABLE/, "Your plan does not allow bookings on this day."],
    [/NOTICE:/, "That time is too soon — please pick a later slot."],
    [/ADDON_NOTICE/, "One of your add-ons needs more advance notice."],
    [/ADDON_INELIGIBLE/, "One of your add-ons is not available for this booking."],
    [/WINDOW:/, "That date is too far ahead to book right now."],
    [/CLOSED:/, "The salon is closed on that day."],
    [/HOURS:/, "The appointment must fit within opening hours."],
    [/BLACKOUT/, "The salon is unavailable on that date."],
    [/CYCLE:/, "That date falls outside your current subscription cycle."],
    [/INTERVAL:/, "Subscription visits must be at least 7 days apart — please pick a later date."],
    [/CAPACITY/, "That time is fully booked — please choose another slot."],
    [/DUPLICATE/, "You already have a booking on that date."],
    [/NO_VISITS/, "You have no visits remaining in this cycle."],
    [/DEADLINE/, "The rescheduling deadline for this appointment has passed."],
    [/STATE:/, "This appointment can no longer be changed."],
  ];
  for (const [re, friendly] of known) if (re.test(message)) return friendly;
  return "Something went wrong — please try again.";
}

/* ------------------------------------------------------------- profile --- */

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  whatsapp_number: z.string().trim().min(7, "Enter a valid WhatsApp number").max(20),
  address: z.string().trim().min(3, "Enter your address").max(300),
  city: z.string().trim().min(2, "Enter your city").max(80),
  state: z.string().trim().min(2, "Enter your state").max(80),
  preferred_contact_method: z.enum(["phone", "whatsapp", "email"]),
  service_area: z.string().trim().min(2).max(80),
  service_area_confirmed: z.boolean(),
  marketing_consent: z.boolean(),
  notify_booking_reminders: z.boolean(),
  notify_renewal_reminders: z.boolean(),
  notify_promotions: z.boolean(),
});

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomer();
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    whatsapp_number: formData.get("whatsapp_number"),
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    preferred_contact_method: formData.get("preferred_contact_method"),
    service_area: formData.get("service_area") || "ilorin",
    service_area_confirmed: formData.get("service_area_confirmed") === "on",
    marketing_consent: formData.get("marketing_consent") === "on",
    notify_booking_reminders: formData.get("notify_booking_reminders") === "on",
    notify_renewal_reminders: formData.get("notify_renewal_reminders") === "on",
    notify_promotions: formData.get("notify_promotions") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { error: e1 } = await supabase
    .from("profiles")
    .update({ full_name: d.full_name, phone: d.phone })
    .eq("id", session.userId);
  const { error: e2 } = await supabase
    .from("customer_profiles")
    .update({
      whatsapp_number: d.whatsapp_number,
      address: d.address,
      city: d.city,
      state: d.state,
      preferred_contact_method: d.preferred_contact_method,
      service_area: d.service_area.toLowerCase(),
      service_area_confirmed: d.service_area_confirmed,
      marketing_consent: d.marketing_consent,
      notification_preferences: {
        booking_reminders: d.notify_booking_reminders,
        renewal_reminders: d.notify_renewal_reminders,
        promotions: d.notify_promotions,
      },
    })
    .eq("id", session.customerProfile.id);

  if (e1 || e2) return { error: "Could not save your profile — please try again." };
  revalidatePath("/app", "layout");
  return { success: "Profile saved." };
}

/* ------------------------------------------------------------- children -- */

const childSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the child's full name").max(120),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth")
    .refine((d) => new Date(d) <= new Date(), "Date of birth cannot be in the future"),
  gender: z.enum(["female", "male", ""]).transform((v) => (v === "" ? null : v)),
  allergies: z.string().trim().max(1000).default(""),
  sensitivities: z.string().trim().max(1000).default(""),
  hair_scalp_notes: z.string().trim().max(2000).default(""),
  service_notes: z.string().trim().max(2000).default(""),
});

export async function saveChild(
  childId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomer();
  const parsed = childSchema.safeParse({
    full_name: formData.get("full_name"),
    date_of_birth: formData.get("date_of_birth"),
    gender: formData.get("gender") ?? "",
    allergies: formData.get("allergies") ?? "",
    sensitivities: formData.get("sensitivities") ?? "",
    hair_scalp_notes: formData.get("hair_scalp_notes") ?? "",
    service_notes: formData.get("service_notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  if (childId) {
    const { error } = await supabase
      .from("children")
      .update(parsed.data)
      .eq("id", childId)
      .eq("customer_id", session.customerProfile.id);
    if (error) return { error: "Could not save the profile — please try again." };
  } else {
    const { error } = await supabase.from("children").insert({
      ...parsed.data,
      customer_id: session.customerProfile.id,
    });
    if (error) return { error: "Could not create the profile — please try again." };
  }
  revalidatePath("/app/children");
  redirect("/app/children");
}

export async function setChildArchived(
  childId: string,
  archived: boolean,
): Promise<ActionState> {
  const session = await requireCustomer();
  const supabase = await createClient();

  if (archived) {
    // Warn-and-block if the child has an upcoming appointment.
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("child_id", childId)
      .in("status", ["pending_confirmation", "pending_addon_payment", "confirmed", "assigned"])
      .gte("starts_at", new Date().toISOString());
    if ((count ?? 0) > 0) {
      return {
        error:
          "This child has an upcoming appointment. Reschedule or wait until it is completed before archiving.",
      };
    }
  }

  const { error } = await supabase
    .from("children")
    .update({
      is_active: !archived,
      archived_at: archived ? new Date().toISOString() : null,
    })
    .eq("id", childId)
    .eq("customer_id", session.customerProfile.id);
  if (error) return { error: "Could not update the profile." };
  revalidatePath("/app/children");
  return { success: archived ? "Profile archived." : "Profile restored." };
}

/* -------------------------------------------------------- plan selection -- */

export async function selectPlan(
  planId: string,
  childId: string | null,
): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_select_plan", {
    p_plan_id: planId,
    p_child_id: childId,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app", "layout");
  redirect("/app/subscription?selected=1");
}

export async function cancelPendingSelection(selectionId: string): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cancel_pending_selection", {
    p_selection_id: selectionId,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/subscription");
  return { success: "Selection cancelled." };
}

export async function setRenewalOptOut(
  subscriptionId: string,
  optOut: boolean,
): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_set_renewal_opt_out", {
    p_subscription_id: subscriptionId,
    p_opt_out: optOut,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/subscription");
  return {
    success: optOut
      ? "You will not be renewed after this cycle."
      : "Renewal re-enabled.",
  };
}

/* --------------------------------------------------------------- booking -- */

const bookingSchema = z.object({
  subscription_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  location_type: z.enum(["salon", "home"]),
  child_id: z.string().uuid().nullable(),
  extra_service_ids: z.array(z.string().uuid()).max(6),
  notes: z.string().trim().max(500).default(""),
});

export async function bookAppointment(payload: {
  subscription_id: string;
  service_id: string;
  starts_at: string;
  location_type: "salon" | "home";
  child_id: string | null;
  extra_service_ids: string[];
  notes: string;
}): Promise<ActionState & { appointmentId?: string }> {
  await requireCustomer();
  const parsed = bookingSchema.safeParse(payload);
  if (!parsed.success) return { error: "Invalid booking details." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_book_appointment", {
    p_subscription_id: parsed.data.subscription_id,
    p_service_id: parsed.data.service_id,
    p_starts_at: parsed.data.starts_at,
    p_location_type: parsed.data.location_type,
    p_child_id: parsed.data.child_id,
    p_extra_service_ids: parsed.data.extra_service_ids,
    p_customer_notes: parsed.data.notes,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app", "layout");
  return { success: "Booked!", appointmentId: data as string };
}

export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAt: string,
  reason: string,
): Promise<ActionState> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reschedule_appointment", {
    p_appointment_id: appointmentId,
    p_new_starts_at: newStartsAt,
    p_reason: reason.slice(0, 300),
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/appointments");
  redirect(`/app/appointments/${appointmentId}?rescheduled=1`);
}

/* ----------------------------------------------------- prompts/favourites - */

export async function dismissPrompt(promptId: string): Promise<void> {
  const session = await requireCustomer();
  const supabase = await createClient();
  await supabase
    .from("retention_prompts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", promptId)
    .eq("customer_id", session.customerProfile.id);
  revalidatePath("/app");
}

export async function toggleFavourite(
  itemType: "product" | "extra_service" | "consultation_type",
  itemId: string,
): Promise<ActionState> {
  const session = await requireCustomer();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("favourites")
    .select("id")
    .eq("customer_id", session.customerProfile.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .limit(1);
  if (existing && existing.length > 0) {
    await supabase.from("favourites").delete().eq("id", existing[0].id);
  } else {
    await supabase.from("favourites").insert({
      customer_id: session.customerProfile.id,
      item_type: itemType,
      item_id: itemId,
    });
  }
  revalidatePath("/app/favourites");
  revalidatePath("/app/products");
  return {};
}

/* ---------------------------------------------------------- consultations - */

const consultationSchema = z.object({
  consultation_type_id: z.string().uuid(),
  child_id: z.string().uuid().nullable(),
  requested_at: z.string().datetime({ offset: true }),
  concerns: z.string().trim().min(3, "Tell us a little about your concern").max(2000),
});

export async function bookConsultation(payload: {
  consultation_type_id: string;
  child_id: string | null;
  requested_at: string;
  concerns: string;
}): Promise<ActionState> {
  const session = await requireCustomer();
  const parsed = consultationSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: types } = await supabase
    .from("consultation_types")
    .select("*")
    .eq("id", parsed.data.consultation_type_id)
    .limit(1);
  const type = types?.[0];
  if (!type || !type.is_active) return { error: "This consultation is unavailable." };

  const { data: activeSub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", session.customerProfile.id)
    .in("status", ["active", "expiring_soon", "renewal_due"])
    .limit(1);
  const isSubscriber = (activeSub?.length ?? 0) > 0;
  if (type.subscriber_only && !isSubscriber) {
    return { error: "This consultation is for active subscribers only." };
  }
  const price = Math.max(
    0,
    type.price_kobo - (isSubscriber ? type.subscriber_discount_kobo : 0),
  );

  const { error } = await supabase.from("consultation_bookings").insert({
    customer_id: session.customerProfile.id,
    child_id: parsed.data.child_id,
    consultation_type_id: type.id,
    requested_at: parsed.data.requested_at,
    concerns: parsed.data.concerns,
    price_kobo: price,
    status: price > 0 ? "pending_payment" : "pending_confirmation",
  });
  if (error) return { error: "Could not submit your booking — please try again." };
  revalidatePath("/app/consultations");
  redirect("/app/consultations?submitted=1");
}
