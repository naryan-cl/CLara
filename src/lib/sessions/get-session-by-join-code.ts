import { createClient } from "@/lib/supabase/server";
import {
  normalizeJoinCode,
  SESSION_SELECT,
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
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("stream_id", stream.id)
    .eq("join_code", code)
    .maybeSingle();

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

  return { session: data as SessionSummary, error: null };
}
