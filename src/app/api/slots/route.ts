import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** Available booking slots for a date/location/duration (RLS-safe RPC). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ slots: [] });
  }
  const params = request.nextUrl.searchParams;
  const date = params.get("date");
  const location = params.get("location") === "home" ? "home" : "salon";
  const duration = Math.min(600, Math.max(5, Number(params.get("duration") ?? 60)));

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_get_available_slots", {
    p_date: date,
    p_location: location,
    p_duration_minutes: duration,
  });
  if (error) {
    return NextResponse.json({ error: "could not load slots" }, { status: 500 });
  }
  return NextResponse.json({
    slots: (data ?? []).map((r: { slot_start: string; remaining_capacity: number }) => ({
      startsAt: r.slot_start,
      remaining: r.remaining_capacity,
    })),
  });
}
