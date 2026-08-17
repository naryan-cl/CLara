import { createClient } from "@/lib/supabase/server";

const MAX_RELATED = 8;

/**
 * Replace document → session Relate edges that point at this gathering.
 * Nesting stays on documents.session_id; these rows are user-described links.
 */
export async function setSessionDocumentLinks(input: {
  streamId: string;
  sessionId: string;
  createdBy: string;
  documentIds: string[];
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const unique = [
    ...new Set(input.documentIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, MAX_RELATED);

  const { error: deleteError } = await supabase
    .from("document_links")
    .delete()
    .eq("target_session_id", input.sessionId);

  if (deleteError) {
    if (
      deleteError.message?.includes("document_links") ||
      deleteError.message?.includes("schema cache")
    ) {
      return { error: null };
    }
    return { error: deleteError.message };
  }

  if (unique.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from("document_links").insert(
    unique.map((source_document_id) => ({
      stream_id: input.streamId,
      source_document_id,
      target_document_id: null,
      target_session_id: input.sessionId,
      created_by: input.createdBy,
    })),
  );

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
