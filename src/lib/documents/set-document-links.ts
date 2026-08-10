import { createClient } from "@/lib/supabase/server";

export type DocumentLinkInput = {
  streamId: string;
  sourceDocumentId: string;
  createdBy: string;
  targetDocumentIds?: string[];
  targetSessionIds?: string[];
};

/**
 * Persist user-described Relate edges. Never nests (nesting = session_id).
 */
export async function setDocumentLinks(
  input: DocumentLinkInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const docIds = [...new Set(input.targetDocumentIds ?? [])].filter(
    (id) => id !== input.sourceDocumentId,
  );
  const sessionIds = [...new Set(input.targetSessionIds ?? [])];

  const { error: deleteError } = await supabase
    .from("document_links")
    .delete()
    .eq("source_document_id", input.sourceDocumentId);

  if (deleteError) {
    if (
      deleteError.message?.includes("document_links") ||
      deleteError.message?.includes("schema cache")
    ) {
      return { error: null }; // migration not applied yet — fail soft
    }
    return { error: deleteError.message };
  }

  const rows = [
    ...docIds.map((target_document_id) => ({
      stream_id: input.streamId,
      source_document_id: input.sourceDocumentId,
      target_document_id,
      target_session_id: null as string | null,
      created_by: input.createdBy,
    })),
    ...sessionIds.map((target_session_id) => ({
      stream_id: input.streamId,
      source_document_id: input.sourceDocumentId,
      target_document_id: null as string | null,
      target_session_id,
      created_by: input.createdBy,
    })),
  ];

  if (rows.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from("document_links").insert(rows);
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
