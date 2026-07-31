import { createClient } from "@/lib/supabase/server";
import type { CommonsDocument } from "@/lib/documents/types";

/**
 * Documents flagged needs_review for a stream (Admin Queue).
 * Kept in lib/ so the admin page stays thin and this is easy to test later.
 */
export async function listNeedsReviewDocuments(
  streamId: string,
): Promise<{ documents: CommonsDocument[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, stream_id, created_by, content, title, session_id, type, participants, tags, privacy_status, needs_review, created_at, updated_at",
    )
    .eq("stream_id", streamId)
    .eq("needs_review", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { documents: [], error: error.message };
  }

  return {
    documents: (data ?? []) as CommonsDocument[],
    error: null,
  };
}
