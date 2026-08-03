import { createAdminClient } from "@/lib/supabase/admin";
import { embedTexts } from "@/lib/openai/embed";
import { chunkText } from "@/lib/embeddings/chunk-text";

export type StoreDocumentEmbeddingsInput = {
  documentId: string;
  streamId: string;
  content: string;
};

/**
 * Chunk + embed one document's content and (re)write its
 * `document_embeddings` rows. Deletes any existing rows for the document
 * first, so this is safe to re-run (Inngest retries/replays included)
 * without leaving stale or duplicate chunks behind.
 */
export async function storeDocumentEmbeddings(
  input: StoreDocumentEmbeddingsInput,
): Promise<{ chunkCount: number }> {
  const admin = createAdminClient();
  const chunks = chunkText(input.content);

  const { error: deleteError } = await admin
    .from("document_embeddings")
    .delete()
    .eq("document_id", input.documentId);

  if (deleteError) {
    throw new Error(`store-document-embeddings delete: ${deleteError.message}`);
  }

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const vectors = await embedTexts(chunks);

  const rows = chunks.map((chunk, index) => ({
    document_id: input.documentId,
    stream_id: input.streamId,
    chunk_index: index,
    content: chunk,
    embedding: vectors[index],
  }));

  const { error: insertError } = await admin
    .from("document_embeddings")
    .insert(rows);

  if (insertError) {
    throw new Error(`store-document-embeddings insert: ${insertError.message}`);
  }

  return { chunkCount: chunks.length };
}
