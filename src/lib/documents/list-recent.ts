import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";

/**
 * Recent Commons documents for a stream (member-visible via RLS).
 * Kept in lib/ so UI stays thin and this is easy to test later.
 */
export async function listRecentDocuments(
  streamId: string,
  limit = 10,
): Promise<{ documents: CommonsDocument[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      DOCUMENT_SELECT,
    )
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { documents: [], error: error.message };
  }

  return {
    documents: (data ?? []) as CommonsDocument[],
    error: null,
  };
}
