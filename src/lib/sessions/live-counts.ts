import { createClient } from "@/lib/supabase/server";

export type SessionLiveCounts = {
  inProgress: number;
  submitted: number;
};

/**
 * Live board counts: drafts linked to the session = in progress;
 * non-draft documents with primary session_id = submitted.
 */
export async function getSessionLiveCounts(
  sessionId: string,
): Promise<{ counts: SessionLiveCounts; error: string | null }> {
  const supabase = await createClient();

  const [drafts, submitted] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("is_draft", true),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("is_draft", false),
  ]);

  if (drafts.error) {
    return {
      counts: { inProgress: 0, submitted: 0 },
      error: drafts.error.message,
    };
  }
  if (submitted.error) {
    return {
      counts: { inProgress: 0, submitted: 0 },
      error: submitted.error.message,
    };
  }

  return {
    counts: {
      inProgress: drafts.count ?? 0,
      submitted: submitted.count ?? 0,
    },
    error: null,
  };
}
