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

function isMissingSessionRelationsTable(message: string | undefined): boolean {
  return (
    message?.includes("session_relations") === true ||
    message?.includes("schema cache") === true
  );
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
    if (isMissingSessionRelationsTable(error.message)) {
      return { ids: [], error: null };
    }
    return { ids: [], error: error.message };
  }

  return {
    ids: (data ?? []).map((row) => String(row.related_session_id)),
    error: null,
  };
}

/** Sessions that Relate *to* this gathering (stored on the other session's row). */
export async function listIncomingRelatedSessionIds(
  sessionId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_relations")
    .select("session_id")
    .eq("related_session_id", sessionId);

  if (error) {
    if (isMissingSessionRelationsTable(error.message)) {
      return { ids: [], error: null };
    }
    return { ids: [], error: error.message };
  }

  return {
    ids: (data ?? []).map((row) => String(row.session_id)),
    error: null,
  };
}

/** Outgoing + incoming session Relate ids for edit forms (deduped). */
export async function listAllRelatedSessionIds(
  sessionId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const [outgoing, incoming] = await Promise.all([
    listRelatedSessionIds(sessionId),
    listIncomingRelatedSessionIds(sessionId),
  ]);
  if (outgoing.error) return outgoing;
  if (incoming.error) return incoming;
  return {
    ids: [...new Set([...outgoing.ids, ...incoming.ids])],
    error: null,
  };
}
