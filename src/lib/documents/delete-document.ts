import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { isAttending } from "@/lib/sessions/attendance";
import { trashSchemaError } from "@/lib/trash/schema";

/**
 * Move a Commons document to Admin Trash (soft-delete).
 * Same people as edit: author, stream admin, or session attendee.
 * Comments, embeddings, and original audio stay so an admin can restore.
 */
export async function deleteDocument(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id, stream_id, created_by, session_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { error: trashSchemaError(error.message) };
  }
  if (!data) {
    return {
      error: "Document not found, or you don't have permission to delete it.",
    };
  }

  const { stream } = await getActiveStream();
  if (!stream || data.stream_id !== stream.id) {
    return {
      error: "Document not found, or you don't have permission to delete it.",
    };
  }

  const attending = data.session_id
    ? (await isAttending(String(data.session_id), user.id)).attending
    : false;

  const canDelete =
    data.created_by === user.id || stream.role === "admin" || attending;
  if (!canDelete) {
    return {
      error: "You don't have permission to delete this document.",
    };
  }

  try {
    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from("documents")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq("id", id)
      .eq("stream_id", stream.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { error: trashSchemaError(updateError.message) };
    }
    if (!updated) {
      return {
        error: "Document not found, or it was already in Trash.",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: trashSchemaError(message) };
  }

  return { error: null };
}
