import { createClient } from "@/lib/supabase/server";
import type { SessionSummary } from "@/lib/sessions/types";

/**
 * Sessions visible to the current member in a stream (RLS-scoped).
 * Kept in lib/ so UI stays thin, same pattern as lib/documents/list-recent.
 */
export async function listSessions(
  streamId: string,
): Promise<{ sessions: SessionSummary[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, stream_id, name, occurred_at, created_by, created_at, updated_at")
    .eq("stream_id", streamId)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { sessions: [], error: error.message };
  }

  return { sessions: (data ?? []) as SessionSummary[], error: null };
}
