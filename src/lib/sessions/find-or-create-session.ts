import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode } from "@/lib/sessions/types";

/**
 * Backend-only (admin client, bypasses RLS): resolve a session by name
 * within a stream, creating it if it doesn't exist yet. Used by the OKF
 * enrichment Inngest job.
 */
export async function findOrCreateSessionByName(
  streamId: string,
  name: string,
): Promise<{ sessionId: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sessionId: null, error: null };
  }

  const admin = createAdminClient();

  const existing = await admin
    .from("sessions")
    .select("id")
    .eq("stream_id", streamId)
    .eq("name", trimmed)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return { sessionId: existing.data.id as string, error: null };
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await admin
      .from("sessions")
      .insert({
        stream_id: streamId,
        name: trimmed,
        join_code: generateJoinCode(),
      })
      .select("id")
      .single();

    if (!error && data) {
      return { sessionId: data.id as string, error: null };
    }

    if (error?.code === "23505") {
      const again = await admin
        .from("sessions")
        .select("id")
        .eq("stream_id", streamId)
        .eq("name", trimmed)
        .maybeSingle();
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
      const legacy = await admin
        .from("sessions")
        .upsert(
          { stream_id: streamId, name: trimmed },
          { onConflict: "stream_id,name", ignoreDuplicates: false },
        )
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
