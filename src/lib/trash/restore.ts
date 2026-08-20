import { createAdminClient } from "@/lib/supabase/admin";
import { trashSchemaError } from "@/lib/trash/schema";
import type { TrashKind } from "@/lib/trash/types";

export type RestoreTrashResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

/**
 * Bring a trashed Commons document or session back. Service-role write
 * after the caller has already checked stream-admin.
 */
export async function restoreTrashItem(
  streamId: string,
  kind: TrashKind,
  id: string,
): Promise<RestoreTrashResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, error: "Missing item id." };
  }

  try {
    if (kind === "document") {
      return await restoreDocument(streamId, trimmed);
    }
    if (kind === "session") {
      return await restoreSession(streamId, trimmed);
    }
    return { ok: false, error: "Unknown trash item." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: trashSchemaError(message) };
  }
}

async function restoreDocument(
  streamId: string,
  id: string,
): Promise<RestoreTrashResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .select("id, stream_id, session_id, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: trashSchemaError(error.message) };
  }
  if (!data || data.stream_id !== streamId) {
    return { ok: false, error: "Document not found in this stream's Trash." };
  }
  if (!data.deleted_at) {
    return { ok: true, note: "That document is already live." };
  }

  let note: string | null = null;
  const patch: Record<string, unknown> = {
    deleted_at: null,
    deleted_by: null,
  };

  const sessionId =
    typeof data.session_id === "string" ? data.session_id : null;
  if (sessionId) {
    const parent = await admin
      .from("sessions")
      .select("id, deleted_at, name")
      .eq("id", sessionId)
      .maybeSingle();
    if (parent.error) {
      return { ok: false, error: trashSchemaError(parent.error.message) };
    }
    if (parent.data?.deleted_at) {
      patch.session_id = null;
      note =
        "Restored as an ungrouped item because its session is still in Trash. Restore the session too if you want them nested again.";
      await admin
        .from("document_sessions")
        .delete()
        .eq("document_id", id)
        .eq("session_id", sessionId);
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("documents")
    .update(patch)
    .eq("id", id)
    .eq("stream_id", streamId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: trashSchemaError(updateError.message) };
  }
  if (!updated) {
    return { ok: false, error: "Could not restore this document." };
  }

  return { ok: true, note };
}

async function restoreSession(
  streamId: string,
  id: string,
): Promise<RestoreTrashResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sessions")
    .select("id, stream_id, name, join_code, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: trashSchemaError(error.message) };
  }
  if (!data || data.stream_id !== streamId) {
    return { ok: false, error: "Session not found in this stream's Trash." };
  }
  if (!data.deleted_at) {
    return { ok: true, note: "That session is already live." };
  }

  const name = String(data.name ?? "").trim();
  const joinCode =
    typeof data.join_code === "string" ? data.join_code : null;

  if (name) {
    const nameClash = await admin
      .from("sessions")
      .select("id")
      .eq("stream_id", streamId)
      .eq("name", name)
      .is("deleted_at", null)
      .neq("id", id)
      .maybeSingle();
    if (nameClash.error) {
      return { ok: false, error: trashSchemaError(nameClash.error.message) };
    }
    if (nameClash.data) {
      return {
        ok: false,
        error: `A live session already uses the name “${name}”. Rename that one, then restore.`,
      };
    }
  }

  if (joinCode) {
    const codeClash = await admin
      .from("sessions")
      .select("id")
      .eq("stream_id", streamId)
      .eq("join_code", joinCode)
      .is("deleted_at", null)
      .neq("id", id)
      .maybeSingle();
    if (codeClash.error) {
      return { ok: false, error: trashSchemaError(codeClash.error.message) };
    }
    if (codeClash.data) {
      return {
        ok: false,
        error: `A live session already uses join code ${joinCode}. Change that code, then restore.`,
      };
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("sessions")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .eq("stream_id", streamId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: trashSchemaError(updateError.message) };
  }
  if (!updated) {
    return { ok: false, error: "Could not restore this session." };
  }

  const nested = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id)
    .not("deleted_at", "is", null);

  const nestedCount = nested.count ?? 0;
  const note =
    nestedCount > 0
      ? `${nestedCount} nested document${nestedCount === 1 ? "" : "s"} ${
          nestedCount === 1 ? "is" : "are"
        } still in Trash. Restore ${nestedCount === 1 ? "it" : "them"} separately if you want them back inside this session.`
      : null;

  return { ok: true, note };
}
