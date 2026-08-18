import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { canEditSession } from "@/lib/sessions/can-edit-session";
import { isAttending } from "@/lib/sessions/attendance";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import {
  parseHighlightColor,
  type SessionHighlightColor,
} from "@/lib/sessions/highlight";
import {
  coerceSession,
  isMissingHighlightColorSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_NO_HIGHLIGHT,
  sessionSelectFallback,
  type SessionSummary,
} from "@/lib/sessions/types";

export type UpdateSessionInput = {
  sessionId: string;
  name: string;
  occurredAt?: string | null;
  seedQuestion?: string | null;
  description?: string | null;
  /** Pass `null` to clear. Omit to leave unchanged. */
  highlightColor?: SessionHighlightColor | null;
};

export type UpdateSessionResult =
  | { ok: true; session: SessionSummary }
  | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

/**
 * Rename / correct session metadata. RLS is the real gate; this helper
 * checks the same people the UI shows the pencil to, then patches the row.
 */
export async function updateSession(
  input: UpdateSessionInput,
): Promise<UpdateSessionResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Session name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return { ok: false, error: "No active stream." };
  }

  let existing = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", input.sessionId)
    .maybeSingle();

  if (existing.error) {
    const fallback = sessionSelectFallback(existing.error.message);
    if (!fallback) {
      return { ok: false, error: existing.error.message };
    }
    existing = await supabase
      .from("sessions")
      .select(fallback)
      .eq("id", input.sessionId)
      .maybeSingle();
    if (existing.error) {
      return { ok: false, error: existing.error.message };
    }
  }
  if (!existing.data) {
    return { ok: false, error: "Session not found." };
  }

  const session = coerceSession(existing.data as Record<string, unknown>);
  if (session.stream_id !== stream.id) {
    return { ok: false, error: "Session not found." };
  }

  const [{ attending }, { documents }] = await Promise.all([
    isAttending(session.id, user.id),
    listDocumentsBySession(session.id),
  ]);

  if (
    !canEditSession({
      userId: user.id,
      createdBy: session.created_by,
      isAdmin: stream.role === "admin",
      attending,
      nestedAuthorIds: documents.map((doc) => doc.created_by),
    })
  ) {
    return { ok: false, error: "You don't have permission to edit this session." };
  }

  const occurredAt = input.occurredAt?.trim() || null;
  const seedQuestion = input.seedQuestion?.trim() || null;
  const description = input.description?.trim() || null;
  const patch: Record<string, unknown> = {
    name,
    occurred_at: occurredAt,
    seed_question: seedQuestion,
    description,
  };
  if (input.highlightColor !== undefined) {
    patch.highlight_color = parseHighlightColor(input.highlightColor);
  }

  let { data, error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", session.id)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error && isMissingHighlightColorSchemaError(error.message)) {
    if (parseHighlightColor(input.highlightColor)) {
      return {
        ok: false,
        error:
          "Session highlights need migration 0033_session_highlight_color.sql.",
      };
    }
    const retry = await supabase
      .from("sessions")
      .update({
        name,
        occurred_at: occurredAt,
        seed_question: seedQuestion,
        description,
      })
      .eq("id", session.id)
      .select(SESSION_SELECT_NO_HIGHLIGHT)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    if (
      error.code === UNIQUE_VIOLATION ||
      error.message?.toLowerCase().includes("duplicate") ||
      error.message?.includes("sessions_stream_id") ||
      error.message?.includes("sessions_stream_name")
    ) {
      return {
        ok: false,
        error: "Another session in this stream already uses that name.",
      };
    }
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "Could not save session." };
  }

  return { ok: true, session: coerceSession(data as Record<string, unknown>) };
}
