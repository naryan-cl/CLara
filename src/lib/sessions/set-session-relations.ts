import { createClient } from "@/lib/supabase/server";

const MAX_RELATED = 3;

/**
 * Replace related-session links for a session (creator/admin via RLS).
 * Caps at 3; ignores self-links.
 */
export async function setSessionRelations(
  sessionId: string,
  relatedSessionIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const unique = [
    ...new Set(
      relatedSessionIds
        .map((id) => id.trim())
        .filter((id) => id && id !== sessionId),
    ),
  ].slice(0, MAX_RELATED);

  const { error: deleteError } = await supabase
    .from("session_relations")
    .delete()
    .eq("session_id", sessionId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (unique.length === 0) {
    return { error: null };
  }

  const { error: insertError } = await supabase.from("session_relations").insert(
    unique.map((related_session_id) => ({
      session_id: sessionId,
      related_session_id,
    })),
  );

  return { error: insertError?.message ?? null };
}
