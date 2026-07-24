import "server-only";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { CustomerProfile, Profile } from "@/lib/types";

export interface SessionContext {
  userId: string;
  profile: Profile;
  customerProfile: CustomerProfile | null;
}

/** Load the signed-in user's profile, or null when signed out. */
export async function getSession(): Promise<SessionContext | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  let customerProfile: CustomerProfile | null = null;
  if (profile.role === "customer") {
    const { data } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("profile_id", user.id)
      .single();
    customerProfile = data;
  }
  return { userId: user.id, profile, customerProfile };
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireCustomer(): Promise<
  SessionContext & { customerProfile: CustomerProfile }
> {
  const session = await requireSession();
  if (session.profile.role !== "customer" || !session.customerProfile) {
    redirect(session.profile.role === "admin" ? "/admin" : "/staff");
  }
  return session as SessionContext & { customerProfile: CustomerProfile };
}

export async function requireStaffOrAdmin(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.profile.role !== "admin" && session.profile.role !== "staff") {
    redirect("/app");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.profile.role !== "admin") redirect("/app");
  return session;
}
