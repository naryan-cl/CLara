import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeListensStagingFromContent } from "@/lib/listens/remove-staging";

/**
 * Delete a Commons document.
 * RLS enforces the same gate as edit: author, stream admin, or session attendee.
 * Comments have no FK to documents, so we clean those up with the admin client
 * after a successful user-scoped delete (best-effort).
 */
export async function deleteDocument(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .select("id, content, stream_id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return {
      error: "Document not found, or you don't have permission to delete it.",
    };
  }

  try {
    const admin = createAdminClient();
    await admin
      .from("comments")
      .delete()
      .eq("target_type", "document")
      .eq("target_id", id);
  } catch (err) {
    // Document is already gone; orphaned comments are non-fatal.
    console.error("deleteDocument: comment cleanup failed", err);
  }

  try {
    await removeListensStagingFromContent(
      String(data.stream_id),
      data.content ? String(data.content) : null,
    );
  } catch (err) {
    console.error("deleteDocument: listens staging cleanup failed", err);
  }

  return { error: null };
}
