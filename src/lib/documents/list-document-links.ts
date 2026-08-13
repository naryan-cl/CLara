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
