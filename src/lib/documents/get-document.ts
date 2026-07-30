import { createClient } from "@/lib/supabase/server";
import type { CommonsDocument } from "@/lib/documents/types";

export async function getDocumentById(
  id: string,
): Promise<{ document: CommonsDocument | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, stream_id, created_by, content, title, session_id, type, participants, tags, privacy_status, needs_review, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { document: null, error: error.message };
  }

  return { document: (data as CommonsDocument | null) ?? null, error: null };
}
