import { createClient } from "@/lib/supabase/server";
import { SESSION_SELECT, type SessionSummary } from "@/lib/sessions/types";

export type CreateSessionInput = {
  streamId: string;
  createdBy: string;
  name: string;
  occurredAt?: string | null;
  seedQuestion?: string | null;
  description?: string | null;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Create a session (event container) in a stream. `name` is unique per
 * stream — if a session with that name already exists, returns the
 * existing row instead of erroring, so the document editor's "new
 * session" field is forgiving of duplicates/races.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const supabase = await createClient();
  const name = input.name.trim();

  if (!name) {
    return { session: null, error: "Session name is required." };
  }

  const seedQuestion = input.seedQuestion?.trim() || null;
  const description = input.description?.trim() || null;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      stream_id: input.streamId,
      created_by: input.createdBy,
      name,
      occurred_at: input.occurredAt ?? null,
      seed_question: seedQuestion,
      description,
    })
    .select(SESSION_SELECT)
    .single();

  if (!error) {
    return { session: data as SessionSummary, error: null };
  }

  if (error.code === UNIQUE_VIOLATION) {
    const { data: existing, error: fetchError } = await supabase
      .from("sessions")
      .select(SESSION_SELECT)
      .eq("stream_id", input.streamId)
      .eq("name", name)
      .maybeSingle();

    if (fetchError || !existing) {
      return { session: null, error: fetchError?.message ?? error.message };
    }
    return { session: existing as SessionSummary, error: null };
  }

  return { session: null, error: error.message };
}
