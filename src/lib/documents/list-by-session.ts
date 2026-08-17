import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";

/**
 * Commons documents tied to one session (member-visible via RLS).
 * Backs the session archive detail page.
 */
export async function listDocumentsBySession(
  sessionId: string,
): Promise<{ documents: CommonsDocument[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      DOCUMENT_SELECT,
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) {
    return { documents: [], error: error.message };
  }

  return { documents: (data ?? []) as CommonsDocument[], error: null };
}
