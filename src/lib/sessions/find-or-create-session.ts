import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Backend-only (admin client, bypasses RLS): resolve a session by name
 * within a stream, creating it if it doesn't exist yet. Used by the OKF
 * enrichment Inngest job, which has no end-user request/session to scope
 * an RLS-bound insert to. `sessions.name` is unique per stream_id, so this
 * upsert is safe to call concurrently for the same proposed name.
 */
export async function findOrCreateSessionByName(
  streamId: string,
  name: string,
): Promise<{ sessionId: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sessionId: null, error: null };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sessions")
    .upsert(
      { stream_id: streamId, name: trimmed },
      { onConflict: "stream_id,name", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) {
    return { sessionId: null, error: error.message };
  }

  return { sessionId: data.id as string, error: null };
}
