import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode, looksLikeUuid } from "@/lib/sessions/types";
import { isMissingTrashSchemaError } from "@/lib/trash/schema";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Admin client bypasses RLS, so we must skip Trash rows ourselves.
 * Before 0035 the column is missing — fall back to an unfiltered lookup.
 */
async function selectLiveSession(
  admin: AdminClient,
  input: { streamId: string; column: "id" | "name"; value: string },
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const live = await admin
    .from("sessions")
    .select("id")
    .eq("stream_id", input.streamId)
    .eq(input.column, input.value)
    .is("deleted_at", null)
    .maybeSingle();

  if (!live.error || !isMissingTrashSchemaError(live.error.message)) {
    return {
      data: live.data ? { id: String(live.data.id) } : null,
      error: live.error,
    };
  }

  const fallback = await admin
    .from("sessions")
    .select("id")
    .eq("stream_id", input.streamId)
    .eq(input.column, input.value)
    .maybeSingle();

  return {
    data: fallback.data ? { id: String(fallback.data.id) } : null,
    error: fallback.error,
  };
}

/**
 * Backend-only (admin client, bypasses RLS): resolve a session by name
 * within a stream, creating it if it doesn't exist yet. Used by the OKF
 * enrichment Inngest job.
 *
 * UUID-like strings are never used as a session *name*. If the string is an
 * existing session id in this stream, we attach to that gathering; otherwise
 * we skip (no new session).
 */
export async function findOrCreateSessionByName(
  streamId: string,
  name: string,
  createdBy?: string | null,
): Promise<{ sessionId: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sessionId: null, error: null };
  }

  const admin = createAdminClient();

  if (looksLikeUuid(trimmed)) {
    const byId = await selectLiveSession(admin, {
      streamId,
      column: "id",
      value: trimmed,
    });
    if (!byId.error && byId.data) {
      return { sessionId: byId.data.id as string, error: null };
    }
    return { sessionId: null, error: null };
  }

  const existing = await selectLiveSession(admin, {
    streamId,
    column: "name",
    value: trimmed,
  });

  if (!existing.error && existing.data) {
    return { sessionId: existing.data.id as string, error: null };
  }

  const insertRow: Record<string, unknown> = {
    stream_id: streamId,
    name: trimmed,
    join_code: generateJoinCode(),
  };
  if (createdBy) {
    insertRow.created_by = createdBy;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    insertRow.join_code = generateJoinCode();
    const { data, error } = await admin
      .from("sessions")
      .insert(insertRow)
      .select("id")
      .single();

    if (!error && data) {
      return { sessionId: data.id as string, error: null };
    }

    if (error?.code === "23505") {
      const again = await selectLiveSession(admin, {
        streamId,
        column: "name",
        value: trimmed,
      });
      if (again.data) {
        return { sessionId: again.data.id as string, error: null };
      }
      continue;
    }

    // Pre-0021: insert without join_code
    if (
      error?.message?.includes("join_code") ||
      error?.message?.includes("schema cache")
    ) {
      const legacyRow: Record<string, unknown> = {
        stream_id: streamId,
        name: trimmed,
      };
      if (createdBy) legacyRow.created_by = createdBy;
      const legacy = await admin
        .from("sessions")
        .upsert(legacyRow, {
          onConflict: "stream_id,name",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();
      if (legacy.error) {
        return { sessionId: null, error: legacy.error.message };
      }
      return { sessionId: legacy.data.id as string, error: null };
    }

    return { sessionId: null, error: error?.message ?? "Could not create session." };
  }

  return { sessionId: null, error: "Could not allocate a unique join code." };
}
