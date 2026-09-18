import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  isMissingHighlightColorSchemaError,
  normalizeJoinCode,
  SESSION_SELECT,
  SESSION_SELECT_NO_HIGHLIGHT,
  sessionSelectFallback,
  type SessionSummary,
} from "@/lib/sessions/types";

/**
 * Resolve a session by short join code. Members use active stream scope;
 * non-members use global lookup (SECURITY DEFINER RPC).
 */
export async function getSessionByJoinCode(
  rawCode: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const code = normalizeJoinCode(rawCode);
  if (code.length < 4) {
    return { session: null, error: "Enter a valid join code." };
  }

  const supabase = await createClient();
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "lookup_join_session",
    { p_token: code },
  );

  if (!rpcError && rpcData?.[0]?.session_id) {
    const row = rpcData[0] as {
      session_id: string;
      stream_id: string;
      name: string;
      join_code: string;
      seed_question: string | null;
    };
    const { data, error } = await supabase
      .from("sessions")
      .select(SESSION_SELECT)
      .eq("id", row.session_id)
      .maybeSingle();

    if (!error && data) {
      return {
        session: coerceSession(data as Record<string, unknown>),
        error: null,
      };
    }

    if (error) {
      const fallback = sessionSelectFallback(error.message);
      if (fallback) {
        const retry = await supabase
          .from("sessions")
          .select(fallback)
          .eq("id", row.session_id)
          .maybeSingle();
        if (!retry.error && retry.data) {
          return {
            session: coerceSession(
              retry.data as unknown as Record<string, unknown>,
            ),
            error: null,
          };
        }
      }
      if (isMissingHighlightColorSchemaError(error.message)) {
        const retry = await supabase
          .from("sessions")
          .select(SESSION_SELECT_NO_HIGHLIGHT)
          .eq("id", row.session_id)
          .maybeSingle();
        if (!retry.error && retry.data) {
          return {
            session: coerceSession(
              retry.data as unknown as Record<string, unknown>,
            ),
            error: null,
          };
        }
      }
    }
  }

  const { getActiveStream } = await import("@/lib/streams/get-active-stream");
  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      session: null,
      error: rpcError?.message ?? "No session matches that join code.",
    };
  }

  let { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("stream_id", stream.id)
    .eq("join_code", code)
    .maybeSingle();

  if (error) {
    const fallback = sessionSelectFallback(error.message);
    if (fallback) {
      const retry = await supabase
        .from("sessions")
        .select(fallback)
        .eq("stream_id", stream.id)
        .eq("join_code", code)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    } else if (isMissingHighlightColorSchemaError(error.message)) {
      const retry = await supabase
        .from("sessions")
        .select(SESSION_SELECT_NO_HIGHLIGHT)
        .eq("stream_id", stream.id)
        .eq("join_code", code)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }
  }

  if (error) {
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
