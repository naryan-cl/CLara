import { createClient } from "@/lib/supabase/server";

const MAX_RELATED = 8;

/**
 * Replace related-session links for a session (creator/admin/attendee via RLS).
 * Caps at 8; ignores self-links.
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

  // Drop every Relate edge touching this session so unchecked incoming links
  // (stored on the other session's row) disappear from the map too.
  const { error: deleteOutgoingError } = await supabase
    .from("session_relations")
    .delete()
    .eq("session_id", sessionId);

  if (deleteOutgoingError) {
    return { error: deleteOutgoingError.message };
  }

  const { error: deleteIncomingError } = await supabase
    .from("session_relations")
    .delete()
    .eq("related_session_id", sessionId);

  if (deleteIncomingError) {
    return { error: deleteIncomingError.message };
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
