import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Quantities per item (v3 §4.5: stock lives per salon; items are global). */
export interface StockTotals {
  on_hand: number;
  reserved: number;
  available: number;
}

/**
 * Stock totals per item. Pass a salonId for that salon's numbers, omit it
 * for brand-wide totals summed across salons.
 */
export async function getStockTotals(
  supabase: SupabaseClient,
  salonId?: string,
): Promise<Map<string, StockTotals>> {
  let q = supabase
    .from("salon_product_stock")
    .select("item_id, quantity_on_hand, quantity_reserved, quantity_available");
  if (salonId) q = q.eq("salon_id", salonId);
  const { data } = await q;
  const map = new Map<string, StockTotals>();
  for (const r of data ?? []) {
    const prev = map.get(r.item_id) ?? { on_hand: 0, reserved: 0, available: 0 };
    map.set(r.item_id, {
      on_hand: prev.on_hand + Number(r.quantity_on_hand),
      reserved: prev.reserved + Number(r.quantity_reserved),
      available: prev.available + Number(r.quantity_available),
    });
  }
  return map;
}

/** First open salon — the operating default while only one salon exists. */
export async function getDefaultSalonId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("salons")
    .select("id")
    .eq("status", "open")
    .order("created_at")
    .limit(1);
  return data?.[0]?.id ?? null;
}
