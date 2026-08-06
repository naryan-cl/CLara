import { createClient } from "@/lib/supabase/server";

export type StreamPeer = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

/**
 * Fellow stream members for participant autocomplete (any member, not admin-only).
 * Backed by list_stream_peers SECURITY DEFINER (migration 0012).
 */
export async function listStreamPeers(
  streamId: string,
): Promise<{ peers: StreamPeer[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_stream_peers", {
    p_stream_id: streamId,
  });

  if (error) {
    return { peers: [], error: error.message };
  }

  return { peers: (data ?? []) as StreamPeer[], error: null };
}
