import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/openai/embed";
import type { AskScope } from "@/lib/ask/scope";
import { askScopeIsActive } from "@/lib/ask/scope";

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

function rowToMatch(row: MatchDocumentChunksRow): CommonsMatch {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    documentType: row.document_type,
    sessionId: row.session_id,
    sessionName: row.session_name,
    content: row.content,
    similarity: row.similarity,
  };
}

function filterByScope(
  matches: CommonsMatch[],
  scope: AskScope | null | undefined,
): CommonsMatch[] {
  if (!askScopeIsActive(scope)) return matches;
  return matches.filter((match) => {
    if (scope?.documentId && match.documentId !== scope.documentId) {
      return false;
    }
    if (scope?.sessionId && match.sessionId !== scope.sessionId) {
      return false;
    }
    return true;
  });
}

/**
 * Embed a question and find the most relevant Commons chunks in one stream,
 * via the `match_document_chunks` SECURITY DEFINER function.
 * Optional `scope` limits retrieval to one document or one session (0016).
 * If 0016 isn't applied yet, falls back to the 3-arg RPC + client filter.
 */
export async function searchCommons(
  streamId: string,
  question: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY,
  scope?: AskScope | null,
): Promise<{ matches: CommonsMatch[]; error: string | null }> {
  const [queryEmbedding] = await embedTexts([question]);
  const supabase = await createClient();
  const scoped = askScopeIsActive(scope);

  // Always try the scoped signature first. Even with null scope args, PostgREST
  // looks up by named params — if 0016 isn't applied, that 5-arg lookup fails
  // and we fall back to the original 3-arg function.
  const scopedRpc = await supabase.rpc("match_document_chunks", {
    p_stream_id: streamId,
    p_query_embedding: queryEmbedding,
    p_match_count: matchCount,
    p_document_id: scope?.documentId ?? null,
    p_session_id: scope?.sessionId ?? null,
  });

  if (!scopedRpc.error) {
    const rows = (scopedRpc.data ?? []) as MatchDocumentChunksRow[];
    const matches = rows
      .map(rowToMatch)
      .filter((match) => match.similarity >= minSimilarity);
    return { matches, error: null };
  }

  const missingScopedFn =
    /schema cache|Could not find the function|PGRST202/i.test(
      scopedRpc.error.message,
    );

  if (!missingScopedFn) {
    return { matches: [], error: scopedRpc.error.message };
  }

  // Pre-0016 database: only the 3-arg overload exists.
  const fallbackCount = scoped ? Math.max(matchCount * 6, 40) : matchCount;
  const fallback = await supabase.rpc("match_document_chunks", {
    p_stream_id: streamId,
    p_query_embedding: queryEmbedding,
    p_match_count: fallbackCount,
  });

  if (fallback.error) {
    return { matches: [], error: fallback.error.message };
  }

  const rows = (fallback.data ?? []) as MatchDocumentChunksRow[];
  let matches = rows
    .map(rowToMatch)
    .filter((match) => match.similarity >= minSimilarity);

  if (scoped) {
    matches = filterByScope(matches, scope).slice(0, matchCount);
  }

  return { matches, error: null };
}
