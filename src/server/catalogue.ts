import "server-only";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  ConsultationType,
  ExtraService,
  Product,
  Service,
  SubscriptionCategory,
  SubscriptionPlan,
} from "@/lib/types";

/**
 * Public catalogue reads. Every function degrades to an empty result when
 * Supabase is unreachable/unconfigured so public pages still render
 * (with honest empty states) instead of crashing.
 */
async function safeRows<T>(fetcher: () => Promise<T[] | null>): Promise<T[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return (await fetcher()) ?? [];
  } catch {
    return [];
  }
}

export async function getPublicCategories(): Promise<SubscriptionCategory[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscription_categories")
      .select("*")
      .eq("is_active", true)
      .eq("is_public", true)
      .is("archived_at", null)
      .order("display_order");
    return data;
  });
}

export async function getPublicPlans(): Promise<SubscriptionPlan[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .in("status", ["active", "closed"])
      .eq("is_public", true)
      .order("display_order");
    return data;
  });
}

export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
  const rows = await safeRows<SubscriptionPlan>(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("slug", slug)
      .limit(1);
    return data;
  });
  return rows[0] ?? null;
}

export interface PlanServiceRow {
  relation: "included" | "excluded" | "optional" | "restricted";
  service: Service;
}

export async function getPlanServices(planId: string): Promise<PlanServiceRow[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscription_plan_services")
      .select("relation, service:services(*)")
      .eq("plan_id", planId);
    return (data ?? []) as unknown as PlanServiceRow[];
  });
}

/** Included-service names per plan, for membership cards (payments spec §1). */
export async function getIncludedServiceNames(
  planIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (planIds.length === 0) return map;
  const rows = await safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscription_plan_services")
      .select("plan_id, relation, service:services(name, display_order)")
      .in("plan_id", planIds)
      .in("relation", ["included", "optional"]);
    return data ?? [];
  });
  for (const row of rows as unknown as Array<{
    plan_id: string;
    service: { name: string; display_order: number | null } | null;
  }>) {
    if (!row.service) continue;
    const list = map.get(row.plan_id) ?? [];
    list.push(row.service.name);
    map.set(row.plan_id, list);
  }
  return map;
}

export async function getServices(): Promise<Service[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("display_order");
    return data;
  });
}

export async function getPublicExtraServices(): Promise<ExtraService[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("extra_services")
      .select("*")
      .eq("is_active", true)
      .eq("is_public", true)
      .is("archived_at", null)
      .order("display_order");
    return data;
  });
}

export async function getConsultationTypes(): Promise<ConsultationType[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("consultation_types")
      .select("*")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("display_order");
    return data;
  });
}

export async function getPublicProducts(): Promise<Product[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("display_order");
    return data;
  });
}

export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  address: string;
  status: string;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Open + coming-soon salons for the public surface (v3 §3.3). */
export async function getPublicSalons(): Promise<PublicSalon[]> {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("salons")
      .select("id, name, slug, city, state, address, status, phone, whatsapp, latitude, longitude")
      .in("status", ["open", "waitlist", "planned"])
      .order("status")
      .order("created_at");
    return data;
  });
}

export async function getPublicSalonHours() {
  return safeRows(async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("salon_hours").select("*").order("day_of_week");
    return data;
  });
}
