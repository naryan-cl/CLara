import { createClient } from "@/lib/supabase/server";

/** User-described Relate edge (never nesting). */
export type DocumentLink = {
  source_document_id: string;
  target_document_id: string | null;
  target_session_id: string | null;
};

/**
 * Stream-scoped Relate links for the dashboard map. Fails soft to [] when
 * migration 0021 has not been applied yet.
 */
export async function listDocumentLinks(
  streamId: string,
): Promise<{ links: DocumentLink[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("source_document_id, target_document_id, target_session_id")
    .eq("stream_id", streamId);

  if (error) {
    if (
      error.message?.includes("document_links") ||
      error.message?.includes("schema cache")
    ) {
      return { links: [], error: null };
    }
    return { links: [], error: error.message };
  }

  return {
    links: (data ?? []) as DocumentLink[],
    error: null,
  };
}

/** Relate edges that start at this document (edit form initial state). */
export async function listLinksForDocument(documentId: string): Promise<{
  relatedDocumentIds: string[];
  relatedSessionIds: string[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("target_document_id, target_session_id")
    .eq("source_document_id", documentId);

  if (error) {
    if (
      error.message?.includes("document_links") ||
      error.message?.includes("schema cache")
    ) {
      return { relatedDocumentIds: [], relatedSessionIds: [], error: null };
    }
    return {
      relatedDocumentIds: [],
      relatedSessionIds: [],
      error: error.message,
    };
  }

  const relatedDocumentIds: string[] = [];
  const relatedSessionIds: string[] = [];
  for (const row of data ?? []) {
    if (row.target_document_id) relatedDocumentIds.push(row.target_document_id);
    if (row.target_session_id) relatedSessionIds.push(row.target_session_id);
  }
  return { relatedDocumentIds, relatedSessionIds, error: null };
}

/** Documents that Relate to this session (not nested children). */
export async function listDocumentsLinkedToSession(
  sessionId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("source_document_id")
    .eq("target_session_id", sessionId);

  if (error) {
    if (
      error.message?.includes("document_links") ||
      error.message?.includes("schema cache")
    ) {
      return { ids: [], error: null };
    }
    return { ids: [], error: error.message };
  }

  return {
    ids: (data ?? []).map((row) => String(row.source_document_id)),
    error: null,
  };
}
