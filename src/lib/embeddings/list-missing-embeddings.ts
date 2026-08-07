import { createClient } from "@/lib/supabase/server";

export type MissingEmbeddingDoc = {
  documentId: string;
  title: string | null;
  documentType: string | null;
};

/**
 * Stream-admin list of non-draft documents with content but zero Ask chunks.
 * Requires `list_documents_missing_embeddings` (migration 0019).
 */
export async function listDocumentsMissingEmbeddings(
  streamId: string,
): Promise<{ documents: MissingEmbeddingDoc[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_documents_missing_embeddings",
    { p_stream_id: streamId },
  );

  if (error) {
    return { documents: [], error: error.message };
  }

  const rows = (data ?? []) as Array<{
    document_id: string;
    title: string | null;
    document_type: string | null;
  }>;

  return {
    documents: rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      documentType: row.document_type,
    })),
    error: null,
  };
}
