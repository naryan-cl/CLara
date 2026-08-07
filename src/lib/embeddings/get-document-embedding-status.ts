import { createClient } from "@/lib/supabase/server";
import type { AskScope } from "@/lib/ask/scope";
import { askScopeIsActive } from "@/lib/ask/scope";

export type DocumentEmbeddingStatus = {
  chunkCount: number;
  indexed: boolean;
  /** True when migration 0019 isn't applied yet (can't know). */
  unknown: boolean;
  error: string | null;
};

/**
 * How many Ask-index chunks exist for one Commons document.
 * Requires `document_chunk_count` (migration 0019).
 */
export async function getDocumentEmbeddingStatus(
  documentId: string,
): Promise<DocumentEmbeddingStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_chunk_count", {
    p_document_id: documentId,
  });

  if (error) {
    // Missing function → migration not applied; don't hard-fail Ask.
    const missing =
      /function|does not exist|schema cache/i.test(error.message) ||
      error.code === "PGRST202";
    return {
      chunkCount: 0,
      indexed: false,
      unknown: missing,
      error: missing ? null : error.message,
    };
  }

  const chunkCount = typeof data === "number" ? data : Number(data ?? 0);
  return {
    chunkCount: Number.isFinite(chunkCount) ? chunkCount : 0,
    indexed: chunkCount > 0,
    unknown: false,
    error: null,
  };
}

/**
 * Index status for an Ask scope. Session scope is "indexed" if any linked
 * document (via documents.session_id) has chunks — best-effort via listing
 * public/own docs then counting; document scope is a single RPC.
 */
export async function getAskScopeEmbeddingStatus(
  streamId: string,
  scope: AskScope | null | undefined,
): Promise<DocumentEmbeddingStatus> {
  if (!askScopeIsActive(scope)) {
    return { chunkCount: 0, indexed: true, unknown: false, error: null };
  }

  if (scope?.documentId) {
    return getDocumentEmbeddingStatus(scope.documentId);
  }

  if (!scope?.sessionId) {
    return { chunkCount: 0, indexed: true, unknown: false, error: null };
  }

  const supabase = await createClient();
  const { data: docs, error: listError } = await supabase
    .from("documents")
    .select("id")
    .eq("stream_id", streamId)
    .eq("session_id", scope.sessionId)
    .eq("is_draft", false);

  if (listError) {
    return {
      chunkCount: 0,
      indexed: false,
      unknown: false,
      error: listError.message,
    };
  }

  if (!docs || docs.length === 0) {
    return { chunkCount: 0, indexed: false, unknown: false, error: null };
  }

  let total = 0;
  let anyUnknown = false;
  for (const doc of docs) {
    const status = await getDocumentEmbeddingStatus(doc.id);
    if (status.error && !status.unknown) {
      return status;
    }
    if (status.unknown) anyUnknown = true;
    total += status.chunkCount;
  }

  return {
    chunkCount: total,
    indexed: total > 0,
    unknown: anyUnknown && total === 0,
    error: null,
  };
}
