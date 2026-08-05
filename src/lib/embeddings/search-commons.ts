import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/openai/embed";

export type CommonsMatch = {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  documentType: string | null;
  sessionId: string | null;
  sessionName: string | null;
  content: string;
  similarity: number;
};

type MatchDocumentChunksRow = {
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  document_type: string | null;
  session_id: string | null;
  session_name: string | null;
  content: string;
  similarity: number;
};

const DEFAULT_MATCH_COUNT = 6;

/**
 * Minimum cosine similarity (1 - distance) to keep a chunk.
 * Below this, the match is treated as off-topic noise so Ask CLara can
 * skip the LLM and say nothing was found. Tunable — start conservative.
 */
export const DEFAULT_MIN_SIMILARITY = 0.28;

/**
 * Embed a question and find the most relevant Commons chunks in one stream,
 * via the `match_document_chunks` SECURITY DEFINER function (0009) — it
 * re-checks stream membership and document privacy itself, so this uses the
 * normal request-scoped (RLS-bound) client, not the admin client.
 */
export async function searchCommons(
  streamId: string,
  question: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY,
): Promise<{ matches: CommonsMatch[]; error: string | null }> {
  const [queryEmbedding] = await embedTexts([question]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    p_stream_id: streamId,
    p_query_embedding: queryEmbedding,
    p_match_count: matchCount,
  });

  if (error) {
    return { matches: [], error: error.message };
  }

  const rows = (data ?? []) as MatchDocumentChunksRow[];
  const matches: CommonsMatch[] = rows
    .map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      documentType: row.document_type,
      sessionId: row.session_id,
      sessionName: row.session_name,
      content: row.content,
      similarity: row.similarity,
    }))
    .filter((match) => match.similarity >= minSimilarity);

  return { matches, error: null };
}
