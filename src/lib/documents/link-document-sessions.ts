import { createClient } from "@/lib/supabase/server";

const MAX_SESSIONS = 3;

/**
 * Sync document ↔ session links. Sets documents.session_id to the first
 * selected (primary, for archive/OKF), and replaces document_sessions rows.
 */
export async function linkDocumentSessions(
  documentId: string,
  sessionIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const unique = [
    ...new Set(sessionIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, MAX_SESSIONS);

  const primary = unique[0] ?? null;

  const { error: updateError } = await supabase
    .from("documents")
    .update({ session_id: primary })
    .eq("id", documentId);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error: deleteError } = await supabase
    .from("document_sessions")
    .delete()
    .eq("document_id", documentId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (unique.length === 0) {
    return { error: null };
  }

  const { error: insertError } = await supabase.from("document_sessions").insert(
    unique.map((session_id) => ({
      document_id: documentId,
      session_id,
    })),
  );

  return { error: insertError?.message ?? null };
}
