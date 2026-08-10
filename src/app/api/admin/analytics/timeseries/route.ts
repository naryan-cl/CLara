import { NextResponse } from "next/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getStreamAnalytics } from "@/lib/analytics/get-stream-analytics";
import { toDateKey } from "@/lib/analytics/range";
import type { AnalyticsRangePreset } from "@/lib/analytics/types";

function parseRange(raw: string | null): AnalyticsRangePreset {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }
  return "30d";
}

function parseEndKey(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return toDateKey(new Date());
}

/** Admin-only stream analytics timeseries (Phase A — existing tables). */
export async function GET(request: Request) {
  const { stream } = await getActiveStream();
  if (!stream) {
    return NextResponse.json({ error: "No active stream." }, { status: 401 });
  }
  if (stream.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const endKey = parseEndKey(url.searchParams.get("end"));

  const { data, error } = await getStreamAnalytics(stream.id, range, endKey);
  if (error || !data) {
    return NextResponse.json(
      { error: error ?? "Failed to load analytics." },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
