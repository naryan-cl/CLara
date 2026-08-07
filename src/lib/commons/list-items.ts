import { createClient } from "@/lib/supabase/server";
import type { CommonsDocument } from "@/lib/documents/types";
import { listSessions } from "@/lib/sessions/list-sessions";
import { listAttendedSessionIds } from "@/lib/sessions/attendance";
import {
  toDocumentItem,
  toSessionItem,
  type CommonsListItem,
} from "@/lib/commons/types";

/**
 * Load every Commons list element the current member can see (RLS-scoped):
 * documents + sessions, with attendance flags for filters.
 */
export async function listCommonsItems(
  streamId: string,
  userId: string,
): Promise<{ items: CommonsListItem[]; error: string | null }> {
  const supabase = await createClient();

  const [docsResult, sessionsResult, attendedResult] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, stream_id, created_by, content, title, session_id, type, participants, tags, privacy_status, needs_review, created_at, updated_at",
      )
      .eq("stream_id", streamId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false }),
    listSessions(streamId),
    listAttendedSessionIds(userId, streamId),
  ]);

  if (docsResult.error) {
    return { items: [], error: docsResult.error.message };
  }
  if (sessionsResult.error) {
    return { items: [], error: sessionsResult.error };
  }
  if (attendedResult.error) {
    return { items: [], error: attendedResult.error };
  }

  const attended = new Set(attendedResult.sessionIds);
  const documents = (docsResult.data ?? []) as CommonsDocument[];

  const items: CommonsListItem[] = [
    ...documents.map((doc) =>
      toDocumentItem(
        doc,
        doc.session_id ? attended.has(doc.session_id) : false,
      ),
    ),
    ...sessionsResult.sessions.map((session) =>
      toSessionItem(session, attended.has(session.id)),
    ),
  ];

  return { items, error: null };
}
