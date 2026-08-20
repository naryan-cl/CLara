import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseListensJobMeta, stripListensJobMeta } from "@/lib/listens/job-meta";
import { isListensPendingBody } from "@/lib/listens/placeholders";
import { TRANSCRIBING_STALE_MS } from "@/lib/listens/process-status";

export type RetranscribeCandidate = {
  documentId: string;
  title: string | null;
};

function isActivelyTranscribing(content: string, updatedAt: string): boolean {
  const body = stripListensJobMeta(content);
  if (!isListensPendingBody(body)) return false;
  const t = new Date(updatedAt).getTime();
  const ageMs = Number.isFinite(t) ? Date.now() - t : 0;
  return ageMs < TRANSCRIBING_STALE_MS;
}

/**
 * Transcripts in this stream that have Listens job meta and are not already
 * mid-Whisper. Audio is probed later at enqueue time (some older files
 * may have been cleaned up).
 */
export async function listRetranscribableTranscripts(
  streamId: string,
  client?: SupabaseClient,
): Promise<{
  candidates: RetranscribeCandidate[];
  inProgress: number;
  withoutMeta: number;
  error: string | null;
}> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, content, updated_at, type")
    .eq("stream_id", streamId)
    .eq("type", "Transcript")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      candidates: [],
      inProgress: 0,
      withoutMeta: 0,
      error: error.message,
    };
  }

  const candidates: RetranscribeCandidate[] = [];
  let inProgress = 0;
  let withoutMeta = 0;

  for (const row of data ?? []) {
    const content = String(row.content ?? "");
    if (isActivelyTranscribing(content, String(row.updated_at ?? ""))) {
      inProgress += 1;
      continue;
    }
    if (!parseListensJobMeta(content)) {
      withoutMeta += 1;
      continue;
    }
    candidates.push({
      documentId: row.id as string,
      title: (row.title as string | null) ?? null,
    });
  }

  return { candidates, inProgress, withoutMeta, error: null };
}
