import { createClient } from "@/lib/supabase/server";
import { listSessions } from "@/lib/sessions/list-sessions";

export type RelateTarget = {
  kind: "document" | "session";
  id: string;
  title: string;
  subtitle?: string | null;
};

/**
 * Sessions + recent Commons documents for Connect / edit pickers.
 * Same list Add pages use, so edit can point at the same neighbors.
 */
export async function listRelateTargets(
  streamId: string,
): Promise<RelateTarget[]> {
  const supabase = await createClient();
  const [docs, sessionsResult] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, type")
      .eq("stream_id", streamId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(80),
    listSessions(streamId),
  ]);

  const targets: RelateTarget[] = [];

  for (const session of sessionsResult.sessions) {
    targets.push({
      kind: "session",
      id: session.id,
      title: session.name,
      subtitle: session.join_code,
    });
  }

  for (const doc of docs.data ?? []) {
    targets.push({
      kind: "document",
      id: doc.id,
      title: doc.title?.trim() || "Untitled",
      subtitle: doc.type,
    });
  }

  return targets;
}
