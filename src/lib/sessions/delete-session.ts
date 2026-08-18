import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { canEditSession } from "@/lib/sessions/can-edit-session";
import { isAttending } from "@/lib/sessions/attendance";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { deleteDocument } from "@/lib/documents/delete-document";
import { SESSION_SELECT, coerceSession, sessionSelectFallback } from "@/lib/sessions/types";

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
 * Delete a session. Same people as edit (host, attendees, admins, nested
 * authors). Nested Commons docs are either ungrouped (FK SET NULL) or
 * deleted first — attendee document-delete RLS needs session_id still set.
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
            `Could not delete “${doc.title?.trim() || "Untitled"}”: ${error}. ` +
            `The session was kept. Remaining nested items: ${
              remaining.length ? remaining.join(", ") : "none"
            }.`,
        };
      }
      deletedIds.push(doc.id);
    }
  }

  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", session.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (/infinite recursion/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Could not delete this session because of a database policy loop. Apply migration 0029_fix_session_delete_rls.sql in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      error: "Session not found, or you don't have permission to delete it.",
    };
  }

  try {
    const admin = createAdminClient();
    await admin
      .from("comments")
      .delete()
      .eq("target_type", "session")
      .eq("target_id", session.id);
  } catch (err) {
    console.error("deleteSession: comment cleanup failed", err);
  }

  return { ok: true };
}
