import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  joinPathForSession,
  SESSION_SELECT,
  validateJoinCode,
  type JoinMode,
  type SessionSummary,
} from "@/lib/sessions/types";

export type UpdateJoinCodeResult =
  | {
      ok: true;
      session: SessionSummary;
      joinPaths: Record<JoinMode, string>;
    }
  | { ok: false; error: string };

/**
 * Host updates a session's short join code within its stream.
 * Unique per (stream_id, join_code); old code links stop working.
 */
export async function updateSessionJoinCode(
  sessionId: string,
  rawCode: string,
): Promise<UpdateJoinCodeResult> {
  const validated = validateJoinCode(rawCode);
  if (!validated.ok) {
    return validated;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const existing = await supabase
    .from("sessions")
    .select("id, created_by, stream_id, join_code")
    .eq("id", sessionId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (!existing.data) {
    return { ok: false, error: "Session not found." };
  }
  if (existing.data.created_by !== user.id) {
    return { ok: false, error: "Only the session host can change the join code." };
  }

  const { data, error } = await supabase
    .from("sessions")
    .update({ join_code: validated.code })
    .eq("id", sessionId)
    .eq("created_by", user.id)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) {
    if (
      error.code === "23505" ||
      error.message?.toLowerCase().includes("duplicate") ||
      error.message?.includes("sessions_stream_join_code")
    ) {
      return {
        ok: false,
        error: "That join code is already used by another session in this stream.",
      };
    }
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "Could not update join code." };
  }

  const session = coerceSession(data as Record<string, unknown>);
  return {
    ok: true,
    session,
    joinPaths: {
      reflect: joinPathForSession(session.join_code, "reflect"),
      record: joinPathForSession(session.join_code, "record"),
      upload: joinPathForSession(session.join_code, "upload"),
    },
  };
}
