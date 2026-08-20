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

export type { ExportCatalogItem } from "@/lib/commons/export-catalog";

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
 * Top-level Commons rows an admin can export, with flags for which
 * content modes are available (transcript vs summary).
 */
export async function listExportCatalog(
  streamId: string,
): Promise<{ items: ExportCatalogItem[]; error: string | null }> {
  const supabase = await createClient();

  const [docsResult, sessionsResult] = await Promise.all([
    supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("stream_id", streamId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false }),
    listSessions(streamId),
  ]);

  if (docsResult.error) {
    return { items: [], error: docsResult.error.message };
  }
  if (sessionsResult.error) {
    return { items: [], error: sessionsResult.error };
  }

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
    const payload = toExportDocument(doc);
    const base = toDocumentItem(doc, false);
    items.push({
      ...base,
      key: `document:${doc.id}`,
      hasTranscript: documentHasExportContent(payload, "transcript"),
      hasSummary: documentHasExportContent(payload, "summary"),
    });
  }

  for (const session of sessionsResult.sessions) {
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
    const base = toSessionItem(session, false);
    items.push({
      ...base,
      key: `session:${session.id}`,
      hasTranscript: sessionHasExportContent(sessionPayload, "transcript"),
      hasSummary: sessionHasExportContent(sessionPayload, "summary"),
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { items, error: null };
}
