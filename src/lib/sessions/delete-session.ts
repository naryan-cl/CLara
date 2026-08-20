import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { canEditSession } from "@/lib/sessions/can-edit-session";
import { isAttending } from "@/lib/sessions/attendance";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { deleteDocument } from "@/lib/documents/delete-document";
import {
  SESSION_SELECT,
  coerceSession,
  sessionSelectFallback,
} from "@/lib/sessions/types";
import { trashSchemaError } from "@/lib/trash/schema";

export type NestedSessionDocument = {
  id: string;
  title: string | null;
  type: string | null;
};

export type DeleteSessionMode = "ungroup" | "delete-nested";

export type DeleteSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move a session to Admin Trash. Same people as edit (host, attendees,
 * admins, nested authors). Nested Commons docs are either ungrouped (kept
 * live) or moved to Trash with the session.
 */
export async function deleteSession(
  sessionId: string,
  mode: DeleteSessionMode,
): Promise<DeleteSessionResult> {
  const id = sessionId.trim();
  if (!id) {
    return { ok: false, error: "Missing session id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return { ok: false, error: "No active stream." };
  }

  let existing = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (existing.error) {
    const fallback = sessionSelectFallback(existing.error.message);
    if (!fallback) {
      return { ok: false, error: existing.error.message };
    }
    existing = await supabase
      .from("sessions")
      .select(fallback)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) {
      return { ok: false, error: existing.error.message };
    }
  }
  if (!existing.data) {
    return { ok: false, error: "Session not found." };
  }

  const session = coerceSession(existing.data as Record<string, unknown>);
  if (session.stream_id !== stream.id) {
    return { ok: false, error: "Session not found." };
  }

  const [{ attending }, { documents }] = await Promise.all([
    isAttending(session.id, user.id),
    listDocumentsBySession(session.id),
  ]);

  if (
    !canEditSession({
      userId: user.id,
      createdBy: session.created_by,
      isAdmin: stream.role === "admin",
      attending,
      nestedAuthorIds: documents.map((doc) => doc.created_by),
    })
  ) {
    return {
      ok: false,
      error: "You don't have permission to delete this session.",
    };
  }

  if (mode === "delete-nested") {
    const deletedIds: string[] = [];
    for (const doc of documents) {
      const { error } = await deleteDocument(doc.id);
      if (error) {
        const remaining = documents
          .filter((d) => !deletedIds.includes(d.id))
          .map((d) => d.title?.trim() || "Untitled");
        return {
          ok: false,
          error:
            `Could not move “${doc.title?.trim() || "Untitled"}” to Trash: ${error}. ` +
            `The session was kept. Remaining nested items: ${
              remaining.length ? remaining.join(", ") : "none"
            }.`,
        };
      }
      deletedIds.push(doc.id);
    }
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    if (mode === "ungroup") {
      const { error: ungroupError } = await admin
        .from("documents")
        .update({ session_id: null })
        .eq("session_id", session.id)
        .is("deleted_at", null);
      if (ungroupError) {
        return { ok: false, error: trashSchemaError(ungroupError.message) };
      }

      const { error: linkError } = await admin
        .from("document_sessions")
        .delete()
        .eq("session_id", session.id);
      if (linkError) {
        return { ok: false, error: linkError.message };
      }
    }

    const { data, error } = await admin
      .from("sessions")
      .update({
        deleted_at: now,
        deleted_by: user.id,
      })
      .eq("id", session.id)
      .eq("stream_id", stream.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: trashSchemaError(error.message) };
    }
    if (!data) {
      return {
        ok: false,
        error: "Session not found, or it was already in Trash.",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: trashSchemaError(message) };
  }

  return { ok: true };
}
