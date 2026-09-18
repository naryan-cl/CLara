import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  generateJoinCode,
  isMissingHighlightColorSchemaError,
  isMissingReflectFlowSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_NO_HIGHLIGHT,
  SESSION_SELECT_NO_REFLECT_FLOW,
  SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT,
  sessionSelectFallback,
  type SessionSummary,
} from "@/lib/sessions/types";
import { buildReflectFlow } from "@/lib/sessions/reflect-flow";

export type CreateSessionInput = {
  streamId: string;
  createdBy: string;
  name: string;
  occurredAt?: string | null;
  seedQuestion?: string | null;
  description?: string | null;
  reflectWelcome?: string | null;
  reflectQuestions?: string[] | null;
};

const UNIQUE_VIOLATION = "23505";

function reflectFields(input: CreateSessionInput) {
  const flow = buildReflectFlow({
    welcome: input.reflectWelcome,
    questions: input.reflectQuestions,
  });
  const guided = flow.questions.length > 0;
  const seedQuestion = guided
    ? flow.questions[0]!
    : input.seedQuestion?.trim() || null;
  return {
    seed_question: seedQuestion,
    reflect_welcome: guided ? flow.welcome : null,
    reflect_questions: guided ? flow.questions : null,
  };
}

/**
 * Create a session (event container) in a stream. `name` is unique per
 * stream — if a session with that name already exists, returns the
 * existing row instead of erroring.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const supabase = await createClient();
  const name = input.name.trim();

  if (!name) {
    return { session: null, error: "Session name is required." };
  }

  const description = input.description?.trim() || null;
  const reflect = reflectFields(input);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const joinCode = generateJoinCode();
    const baseRow = {
      stream_id: input.streamId,
      created_by: input.createdBy,
      name,
      occurred_at: input.occurredAt ?? null,
      description,
      join_code: joinCode,
      ...reflect,
    };

    const { data, error } = await supabase
      .from("sessions")
      .insert(baseRow)
      .select(SESSION_SELECT)
      .single();

    if (!error) {
      return {
        session: coerceSession(data as Record<string, unknown>),
        error: null,
      };
    }

    if (isMissingReflectFlowSchemaError(error.message)) {
      const { reflect_welcome: _w, reflect_questions: _q, ...withoutFlow } =
        baseRow;
      const select = isMissingHighlightColorSchemaError(error.message)
        ? SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT
        : SESSION_SELECT_NO_REFLECT_FLOW;
      const retry = await supabase
        .from("sessions")
        .insert({
          ...withoutFlow,
          seed_question: reflect.seed_question,
        })
        .select(select as typeof SESSION_SELECT)
        .single();
      if (!retry.error && retry.data) {
        return {
          session: coerceSession(retry.data as unknown as Record<string, unknown>),
          error: null,
        };
      }
    }

    if (isMissingHighlightColorSchemaError(error.message)) {
      const retry = await supabase
        .from("sessions")
        .insert(baseRow)
        .select(SESSION_SELECT_NO_HIGHLIGHT)
        .single();
      if (!retry.error && retry.data) {
        return {
          session: coerceSession(retry.data as Record<string, unknown>),
          error: null,
        };
      }
    }

    if (error.code === UNIQUE_VIOLATION) {
      // Name collision → return existing; join_code collision → retry.
      let existing = await supabase
        .from("sessions")
        .select(SESSION_SELECT)
        .eq("stream_id", input.streamId)
        .eq("name", name)
        .maybeSingle();

      if (existing.error) {
        const fallback = sessionSelectFallback(existing.error.message);
        if (fallback) {
          existing = await supabase
            .from("sessions")
            .select(fallback)
            .eq("stream_id", input.streamId)
            .eq("name", name)
            .maybeSingle();
        }
      }

      if (!existing.error && existing.data) {
        return {
          session: coerceSession(existing.data as Record<string, unknown>),
          error: null,
        };
      }
      continue;
    }

    // Pre-migration DBs may lack join_code — fall back without it.
    if (
      error.message?.includes("join_code") ||
      error.message?.includes("schema cache")
    ) {
      const { data: legacy, error: legacyError } = await supabase
        .from("sessions")
        .insert({
          stream_id: input.streamId,
          created_by: input.createdBy,
          name,
          occurred_at: input.occurredAt ?? null,
          seed_question: reflect.seed_question,
          description,
        })
        .select(
          "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token",
        )
        .single();

      if (legacyError || !legacy) {
        return {
          session: null,
          error: legacyError?.message ?? error.message,
        };
      }

      return {
        session: coerceSession(legacy as Record<string, unknown>),
        error: null,
      };
    }

    return { session: null, error: error.message };
  }

  return { session: null, error: "Could not allocate a unique join code." };
}
