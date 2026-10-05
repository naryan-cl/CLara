import { createAdminClient } from "@/lib/supabase/admin";
import { looksLikeUuid } from "@/lib/sessions/types";
import { isMissingTrashSchemaError } from "@/lib/trash/schema";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Admin client bypasses RLS, so we must skip Trash rows ourselves.
 * Before 0035 the column is missing — fall back to an unfiltered lookup.
 */
async function selectLiveSession(
  admin: AdminClient,
  input: { streamId: string; column: "id" | "name"; value: string },
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const live = await admin
    .from("sessions")
    .select("id")
    .eq("stream_id", input.streamId)
    .eq(input.column, input.value)
    .is("deleted_at", null)
    .maybeSingle();

  if (!live.error || !isMissingTrashSchemaError(live.error.message)) {
    return {
      data: live.data ? { id: String(live.data.id) } : null,
      error: live.error,
    };
  }

  const fallback = await admin
    .from("sessions")
    .select("id")
    .eq("stream_id", input.streamId)
    .eq(input.column, input.value)
    .maybeSingle();

  return {
    data: fallback.data ? { id: String(fallback.data.id) } : null,
    error: fallback.error,
  };
}

/**
 * Backend-only (admin client, bypasses RLS): resolve an existing session by
 * name (or id) within a stream. Used by the OKF enrichment Inngest job.
 *
 * Never creates a session — sessions are only created explicitly by a user
 * via "Add a session". Returns null when nothing matches.
 */
export async function findSessionByName(
  streamId: string,
  name: string,
): Promise<{ sessionId: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sessionId: null, error: null };
  }

  const admin = createAdminClient();
  const { data, error } = await selectLiveSession(admin, {
    streamId,
    column: looksLikeUuid(trimmed) ? "id" : "name",
    value: trimmed,
  });

  if (error) {
    return { sessionId: null, error: error.message };
  }
  return { sessionId: data?.id ?? null, error: null };
}
