import { createClient } from "@/lib/supabase/server";
import { documentElementType } from "@/lib/commons/types";
import {
  enumerateDateKeys,
  startKeyForRange,
  toDateKey,
} from "@/lib/analytics/range";
import type {
  AnalyticsRangePreset,
  SeriesPoint,
  StreamAnalyticsData,
  StreamAnalyticsSummary,
  TimeseriesPoint,
} from "@/lib/analytics/types";

type DocRow = {
  type: string | null;
  privacy_status: string;
  needs_review: boolean;
  is_draft: boolean | null;
  created_at: string;
};

type CreatedAtRow = { created_at: string };
type NodeRow = { type: string; created_at: string };
type MemberRow = {
  role: string;
  created_at: string;
  selected_map_theme: string | null;
};

function emptySeriesPoint(date: string): SeriesPoint {
  return { date, chat: 0, record: 0, upload: 0, session: 0, other: 0 };
}

function fillTimeseries(
  keys: string[],
  counts: Map<string, number>,
): TimeseriesPoint[] {
  return keys.map((date) => ({ date, value: counts.get(date) ?? 0 }));
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Aggregate stream Commons / membership / graph stats for admin analytics.
 * Uses the request-scoped client (RLS). Admins can read private docs in-stream.
 */
export async function getStreamAnalytics(
  streamId: string,
  range: AnalyticsRangePreset = "30d",
  endKey: string = toDateKey(new Date()),
): Promise<{ data: StreamAnalyticsData | null; error: string | null }> {
  const supabase = await createClient();
  const startKey = startKeyForRange(range, endKey);

  const [
    docsRes,
    sessionsRes,
    membersRes,
    nodesRes,
    edgesRes,
    commentsRes,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("type, privacy_status, needs_review, is_draft, created_at")
      .eq("stream_id", streamId),
    supabase
      .from("sessions")
      .select("id, created_at")
      .eq("stream_id", streamId),
    supabase
      .from("stream_members")
      .select("role, created_at, selected_map_theme")
      .eq("stream_id", streamId),
    supabase
      .from("nodes")
      .select("type, created_at")
      .eq("stream_id", streamId),
    supabase
      .from("edges")
      .select("id", { count: "exact", head: true })
      .eq("stream_id", streamId),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("stream_id", streamId),
  ]);

  const firstError =
    docsRes.error?.message ||
    sessionsRes.error?.message ||
    membersRes.error?.message ||
    nodesRes.error?.message ||
    edgesRes.error?.message ||
    commentsRes.error?.message;

  if (firstError) {
    return { data: null, error: firstError };
  }

  const docs = (docsRes.data ?? []) as DocRow[];
  const sessions = (sessionsRes.data ?? []) as (CreatedAtRow & { id: string })[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const nodes = (nodesRes.data ?? []) as NodeRow[];

  let attendanceMarks = 0;
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length > 0) {
    const { count, error: attendanceError } = await supabase
      .from("session_attendees")
      .select("session_id", { count: "exact", head: true })
      .in("session_id", sessionIds);
    if (attendanceError) {
      return { data: null, error: attendanceError.message };
    }
    attendanceMarks = count ?? 0;
  }

  const inRange = (iso: string) => {
    const key = toDateKey(iso);
    if (startKey && key < startKey) return false;
    if (key > endKey) return false;
    return true;
  };

  // Chart window: for "all", span from earliest event to endKey (min 7 days).
  let chartStart = startKey;
  if (!chartStart) {
    const stamps = [
      ...docs.map((d) => d.created_at),
      ...sessions.map((s) => s.created_at),
      ...members.map((m) => m.created_at),
      ...nodes.map((n) => n.created_at),
    ];
    if (stamps.length === 0) {
      chartStart = endKey;
    } else {
      chartStart = stamps
        .map(toDateKey)
        .reduce((min, key) => (key < min ? key : min), endKey);
    }
    // Pad short histories so the axis isn't a single day.
    const earliestWanted = addDaysSafe(endKey, -6);
    if (chartStart > earliestWanted) chartStart = earliestWanted;
  }

  const dateKeys = enumerateDateKeys(chartStart, endKey);
  const seriesMap = new Map(
    dateKeys.map((date) => [date, emptySeriesPoint(date)]),
  );
  const docDay = new Map<string, number>();
  const sessionDay = new Map<string, number>();
  const memberDay = new Map<string, number>();
  const nodeDay = new Map<string, number>();

  let drafts = 0;
  let submitted = 0;
  let publicDocs = 0;
  let privateDocs = 0;
  let needsReview = 0;

  for (const doc of docs) {
    const isDraft = Boolean(doc.is_draft);
    if (isDraft) drafts += 1;
    else submitted += 1;
    if (doc.privacy_status === "private") privateDocs += 1;
    else publicDocs += 1;
    if (doc.needs_review) needsReview += 1;

    if (!inRange(doc.created_at)) continue;
    const key = toDateKey(doc.created_at);
    bump(docDay, key);
    const bucket = documentElementType(doc.type);
    const point = seriesMap.get(key);
    if (point) {
      if (bucket === "chat") point.chat += 1;
      else if (bucket === "record") point.record += 1;
      else if (bucket === "upload") point.upload += 1;
      else point.other += 1;
    }
  }

  for (const session of sessions) {
    if (!inRange(session.created_at)) continue;
    const key = toDateKey(session.created_at);
    bump(sessionDay, key);
    const point = seriesMap.get(key);
    if (point) point.session += 1;
  }

  for (const member of members) {
    if (!inRange(member.created_at)) continue;
    bump(memberDay, toDateKey(member.created_at));
  }

  const nodesByType: Record<string, number> = {};
  for (const node of nodes) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    if (!inRange(node.created_at)) continue;
    bump(nodeDay, toDateKey(node.created_at));
  }

  const themePicks: Record<string, number> = {};
  for (const member of members) {
    const theme = member.selected_map_theme ?? "plant";
    themePicks[theme] = (themePicks[theme] ?? 0) + 1;
  }

  const summary: StreamAnalyticsSummary = {
    members: members.length,
    admins: members.filter((m) => m.role === "admin").length,
    documents: docs.length,
    drafts,
    submitted,
    publicDocs,
    privateDocs,
    needsReview,
    sessions: sessions.length,
    attendanceMarks,
    comments: commentsRes.count ?? 0,
    nodes: nodes.length,
    edges: edgesRes.count ?? 0,
    nodesByType,
    themePicks,
  };

  const data: StreamAnalyticsData = {
    range,
    startKey: chartStart,
    endKey,
    summary,
    creationsByType: dateKeys.map(
      (date) => seriesMap.get(date) ?? emptySeriesPoint(date),
    ),
    documentsOverTime: fillTimeseries(dateKeys, docDay),
    sessionsOverTime: fillTimeseries(dateKeys, sessionDay),
    membersOverTime: fillTimeseries(dateKeys, memberDay),
    nodesOverTime: fillTimeseries(dateKeys, nodeDay),
  };

  return { data, error: null };
}

function addDaysSafe(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}
