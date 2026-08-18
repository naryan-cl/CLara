import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  isMissingHighlightColorSchemaError,
  normalizeJoinCode,
  SESSION_SELECT,
  SESSION_SELECT_NO_HIGHLIGHT,
  type SessionSummary,
} from "@/lib/sessions/types";
import { getActiveStream } from "@/lib/streams/get-active-stream";

/**
 * Resolve a session by short join code within the caller's active stream.
 */
export async function getSessionByJoinCode(
  rawCode: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const code = normalizeJoinCode(rawCode);
  if (code.length < 4) {
    return { session: null, error: "Enter a valid join code." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      session: null,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const supabase = await createClient();
  let { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("stream_id", stream.id)
    .eq("join_code", code)
    .maybeSingle();

  if (error && isMissingHighlightColorSchemaError(error.message)) {
    const retry = await supabase
      .from("sessions")
      .select(SESSION_SELECT_NO_HIGHLIGHT)
      .eq("stream_id", stream.id)
      .eq("join_code", code)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    // Pre-migration: try matching share_token prefix.
    if (
      error.message?.includes("join_code") ||
      error.message?.includes("schema cache")
    ) {
      return {
        session: null,
        error:
          "Join codes need migration 0021_session_gathering.sql. Use a share link for now.",
      };
    }
    return { session: null, error: error.message };
  }

  if (!data) {
    return { session: null, error: "No session matches that join code." };
  }

  return {
    session: coerceSession(data as Record<string, unknown>),
    error: null,
  };
}
