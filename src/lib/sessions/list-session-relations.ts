import { createClient } from "@/lib/supabase/server";
import { listSessions } from "@/lib/sessions/list-sessions";

export type SessionRelation = {
  session_id: string;
  related_session_id: string;
};

/**
 * Stream-scoped session ↔ session Relate edges for the dashboard map.
 * Fails soft to [] when migration 0012 is not applied yet.
 */
export async function listSessionRelations(
  streamId: string,
): Promise<{ relations: SessionRelation[]; error: string | null }> {
  const { sessions, error: sessionsError } = await listSessions(streamId);
  if (sessionsError) {
    return { relations: [], error: sessionsError };
  }
  const ids = sessions.map((session) => session.id);
  if (ids.length === 0) {
    return { relations: [], error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_relations")
    .select("session_id, related_session_id")
    .in("session_id", ids);

  if (error) {
    if (
      error.message?.includes("session_relations") ||
      error.message?.includes("schema cache")
    ) {
      return { relations: [], error: null };
    }
    return { relations: [], error: error.message };
  }

  return {
    relations: (data ?? []) as SessionRelation[],
    error: null,
  };
}

export async function listRelatedSessionIds(
  sessionId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_relations")
    .select("related_session_id")
    .eq("session_id", sessionId);

  if (error) {
    if (
      error.message?.includes("session_relations") ||
      error.message?.includes("schema cache")
    ) {
      return { ids: [], error: null };
    }
    return { ids: [], error: error.message };
  }

  return {
    ids: (data ?? []).map((row) => String(row.related_session_id)),
    error: null,
  };
}
