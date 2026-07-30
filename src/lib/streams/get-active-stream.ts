import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_STREAM_SLUG,
  type StreamSummary,
} from "@/lib/streams/types";

type StreamFields = {
  id: string;
  slug: string;
  name: string;
  isolation_enabled: boolean;
};

function normalizeStream(
  value: StreamFields | StreamFields[] | null | undefined,
): StreamFields | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Resolve the active stream for the signed-in user.
 * Prefers Camp CLAI (`camp-clai`); otherwise the first membership.
 * Cached per request so layout + pages can share one query.
 */
export const getActiveStream = cache(async (): Promise<{
  stream: StreamSummary | null;
  streams: StreamSummary[];
  error: string | null;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { stream: null, streams: [], error: "Not signed in." };
  }

  const { data, error } = await supabase
    .from("stream_members")
    .select("role, streams ( id, slug, name, isolation_enabled )")
    .eq("user_id", user.id);

  if (error) {
    return {
      stream: null,
      streams: [],
      error: error.message,
    };
  }

  const streams: StreamSummary[] = (data ?? [])
    .map((row) => {
      const streamRow = normalizeStream(
        row.streams as StreamFields | StreamFields[] | null,
      );
      if (!streamRow) return null;
      const role = row.role === "admin" ? "admin" : "member";
      return {
        id: streamRow.id,
        slug: streamRow.slug,
        name: streamRow.name,
        isolation_enabled: streamRow.isolation_enabled,
        role,
      } satisfies StreamSummary;
    })
    .filter((s): s is StreamSummary => s !== null);

  const preferred =
    streams.find((s) => s.slug === DEFAULT_STREAM_SLUG) ?? streams[0] ?? null;

  return { stream: preferred, streams, error: null };
});
