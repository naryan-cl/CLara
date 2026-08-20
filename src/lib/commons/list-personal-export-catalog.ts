import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  documentHasExportContent,
  sessionHasExportContent,
  type ExportDocumentPayload,
  type ExportSessionPayload,
} from "@/lib/commons/export";
import type { ExportCatalogItem } from "@/lib/commons/export-catalog";
import { toDocumentItem, toSessionItem } from "@/lib/commons/types";
import { listSessions } from "@/lib/sessions/list-sessions";
import { listAttendedSessionIds } from "@/lib/sessions/attendance";

function toExportDocument(doc: CommonsDocument): ExportDocumentPayload {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    content: doc.content,
    summary: doc.summary ?? null,
    created_at: doc.created_at,
    privacy_status: doc.privacy_status,
  };
}

/**
 * Sessions the member attended or hosts, plus their own ungrouped artifacts.
 */
export async function listPersonalExportCatalog(
  streamId: string,
  userId: string,
): Promise<{ items: ExportCatalogItem[]; error: string | null }> {
  const supabase = await createClient();

  const [docsResult, sessionsResult, attendedResult] = await Promise.all([
    supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
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

  const attendedSet = new Set(attendedResult.sessionIds);
  const documents = (docsResult.data ?? []) as CommonsDocument[];
  const docsBySession = new Map<string, ExportDocumentPayload[]>();

  for (const doc of documents) {
    if (!doc.session_id) continue;
    const payload = toExportDocument(doc);
    const list = docsBySession.get(doc.session_id) ?? [];
    list.push(payload);
    docsBySession.set(doc.session_id, list);
  }

  const items: ExportCatalogItem[] = [];

  for (const doc of documents) {
    if (doc.session_id) continue;
    if (doc.created_by !== userId) continue;
    const payload = toExportDocument(doc);
    const base = toDocumentItem(doc, false);
    items.push({
      ...base,
      key: `document:${doc.id}`,
      hasTranscript: documentHasExportContent(payload, "transcript"),
      hasSummary: documentHasExportContent(payload, "summary"),
      hasStructured: documentHasExportContent(payload, "structured"),
    });
  }

  for (const session of sessionsResult.sessions) {
    const isHost = session.created_by === userId;
    const attended = attendedSet.has(session.id);
    if (!isHost && !attended) continue;

    const sessionPayload: ExportSessionPayload = {
      id: session.id,
      name: session.name,
      occurred_at: session.occurred_at,
      created_at: session.created_at,
      seed_question: session.seed_question,
      description: session.description,
      synthesis_document_id: session.synthesis_document_id,
      documents: docsBySession.get(session.id) ?? [],
    };
    const base = toSessionItem(session, attended);
    items.push({
      ...base,
      key: `session:${session.id}`,
      hasTranscript: sessionHasExportContent(sessionPayload, "transcript"),
      hasSummary: sessionHasExportContent(sessionPayload, "summary"),
      hasStructured: sessionHasExportContent(sessionPayload, "structured"),
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { items, error: null };
}
