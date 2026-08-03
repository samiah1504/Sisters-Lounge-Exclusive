"use server";

import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

const waitlistSchema = z.object({
  city: z.string().trim().min(2).max(80),
  full_name: z.string().trim().max(120).default(""),
  contact: z.string().trim().min(4, "Enter a phone number or email").max(160),
  salon_id: z.string().uuid().nullable(),
});

/** Public (no account needed): join a coming-soon city's waitlist (v3 §3.3). */
export async function joinCityWaitlist(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get("contact") ?? "").trim();
  const parsed = waitlistSchema.safeParse({
    city: formData.get("city"),
    full_name: formData.get("full_name") ?? "",
    contact: raw,
    salon_id: String(formData.get("salon_id") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!isSupabaseConfigured()) {
    return { error: "Waitlist signup is not available right now — please try again later." };
  }
  const contact_type = raw.includes("@") ? "email" : "whatsapp";
  const supabase = await createClient();
  const { error } = await supabase.from("city_waitlist").insert({
    ...parsed.data,
    contact_type,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { success: "You're already on this waitlist — we'll be in touch!" };
    }
    return { error: "Could not join the waitlist — please try again." };
  }
  return {
    success: "You're on the list! We'll message you as soon as this salon opens.",
  };
}
