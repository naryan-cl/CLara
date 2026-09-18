import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { canEditSession } from "@/lib/sessions/can-edit-session";
import { isAttending } from "@/lib/sessions/attendance";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import {
  parseHighlightColor,
  type SessionHighlightColor,
} from "@/lib/sessions/highlight";
import { buildReflectFlow } from "@/lib/sessions/reflect-flow";
import {
  coerceSession,
  isMissingHighlightColorSchemaError,
  isMissingReflectFlowSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_NO_HIGHLIGHT,
  SESSION_SELECT_NO_REFLECT_FLOW,
  SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT,
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
  /** When set, updates guided Reflect fields. Pass empty questions for simple mode. */
  reflectWelcome?: string | null;
  reflectQuestions?: string[] | null;
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
  const description = input.description?.trim() || null;
  const patch: Record<string, unknown> = {
    name,
    occurred_at: occurredAt,
    description,
  };

  if (input.reflectQuestions !== undefined) {
    const flow = buildReflectFlow({
      welcome: input.reflectWelcome,
      questions: input.reflectQuestions,
    });
    if (flow.questions.length > 0) {
      patch.seed_question = flow.questions[0];
      patch.reflect_welcome = flow.welcome;
      patch.reflect_questions = flow.questions;
    } else {
      patch.seed_question = input.seedQuestion?.trim() || null;
      patch.reflect_welcome = null;
      patch.reflect_questions = null;
    }
  } else {
    patch.seed_question = input.seedQuestion?.trim() || null;
  }

  if (input.highlightColor !== undefined) {
    patch.highlight_color = parseHighlightColor(input.highlightColor);
  }

  let { data, error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", session.id)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error && isMissingReflectFlowSchemaError(error.message)) {
    if (
      input.reflectQuestions !== undefined &&
      (input.reflectQuestions?.length ?? 0) > 0
    ) {
      return {
        ok: false,
        error:
          "Guided reflection needs migration 0040_session_reflect_flow.sql.",
      };
    }
    const { reflect_welcome: _w, reflect_questions: _q, ...withoutFlow } =
      patch;
    const select = isMissingHighlightColorSchemaError(error.message)
      ? SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT
      : SESSION_SELECT_NO_REFLECT_FLOW;
    const retry = await supabase
      .from("sessions")
      .update(withoutFlow)
      .eq("id", session.id)
      .select(select as typeof SESSION_SELECT)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && isMissingHighlightColorSchemaError(error.message)) {
    if (parseHighlightColor(input.highlightColor)) {
      return {
        ok: false,
        error:
          "Session highlights need migration 0033_session_highlight_color.sql.",
      };
    }
    const { highlight_color: _h, ...withoutHighlight } = patch;
    const retry = await supabase
      .from("sessions")
      .update(withoutHighlight)
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
