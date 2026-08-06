import { createClient } from "@/lib/supabase/server";
import { SESSION_SELECT, type SessionSummary } from "@/lib/sessions/types";

/**
 * Sessions visible to the current member in a stream (RLS-scoped).
 * Most recent first (created_at), so Connect dropdowns stay useful.
 */
export async function listSessions(
  streamId: string,
): Promise<{ sessions: SessionSummary[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false });

  if (error) {
    return { sessions: [], error: error.message };
  }

  return { sessions: (data ?? []) as SessionSummary[], error: null };
}
