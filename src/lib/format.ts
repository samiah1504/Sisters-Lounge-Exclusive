/** Formatting helpers. All money is integer kobo; all times Africa/Lagos. */

export const LAGOS_TZ = "Africa/Lagos";

export function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${h} hour${h > 1 ? "s" : ""} ${m} min`;
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    timeZone: LAGOS_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    timeZone: LAGOS_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** Calendar date (YYYY-MM-DD) of an instant, in Lagos time. */
export function lagosDateOf(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: LAGOS_TZ });
}
