import type { AnalyticsRangePreset } from "@/lib/analytics/types";

/** Calendar date key YYYY-MM-DD in local-ish UTC noon-safe form. */
export function toDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

export function rangeDurationDays(range: AnalyticsRangePreset): number | null {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  return null;
}

/** Inclusive start date key for a preset ending on endKey (UTC). */
export function startKeyForRange(
  range: AnalyticsRangePreset,
  endKey: string,
): string | null {
  const days = rangeDurationDays(range);
  if (days == null) return null;
  return addDays(endKey, -(days - 1));
}

/** Fill every day in [start, end] with zeros so charts have continuous X axes. */
export function enumerateDateKeys(
  startKey: string,
  endKey: string,
): string[] {
  const keys: string[] = [];
  let cursor = startKey;
  // Cap runaway loops (e.g. bad input) at ~3 years.
  for (let i = 0; i < 1200; i += 1) {
    keys.push(cursor);
    if (cursor >= endKey) break;
    cursor = addDays(cursor, 1);
  }
  return keys;
}
