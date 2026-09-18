import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  isMissingJoinCodeSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_LEGACY,
  sessionSelectFallback,
  type SessionSummary,
} from "@/lib/sessions/types";

/**
 * Sessions visible to the current member in a stream (RLS-scoped).
 * Most recent first (created_at), so Connect dropdowns stay useful.
 */
export async function listSessions(
  streamId: string,
): Promise<{ sessions: SessionSummary[]; error: string | null }> {
  const supabase = await createClient();

  const primary = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false });

  if (!primary.error) {
    return {
      sessions: (primary.data ?? []).map((row) =>
        coerceSession(row as Record<string, unknown>),
      ),
      error: null,
    };
  }

  const fallback = sessionSelectFallback(primary.error.message);
  if (fallback) {
    let retry = await supabase
      .from("sessions")
      .select(fallback)
      .eq("stream_id", streamId)
      .order("created_at", { ascending: false });

    if (retry.error) {
      const nested = sessionSelectFallback(retry.error.message);
      if (nested && nested !== fallback) {
        retry = await supabase
          .from("sessions")
          .select(nested)
          .eq("stream_id", streamId)
          .order("created_at", { ascending: false });
      }
    }

    if (!retry.error) {
      return {
        sessions: (retry.data ?? []).map((row) =>
          coerceSession(row as unknown as Record<string, unknown>),
        ),
        error: null,
      };
    }
  }

  if (!isMissingJoinCodeSchemaError(primary.error.message)) {
    return { sessions: [], error: primary.error.message };
  }

  const legacy = await supabase
    .from("sessions")
    .select(SESSION_SELECT_LEGACY)
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false });

  if (legacy.error) {
    return { sessions: [], error: legacy.error.message };
  }

  return {
    sessions: (legacy.data ?? []).map((row) =>
      coerceSession(row as Record<string, unknown>),
    ),
    error: null,
  };
}
