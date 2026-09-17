import { createClient } from "@/lib/supabase/server";

export type AllowlistEntry = {
  email: string;
  createdAt: string;
};

export async function listStreamAllowlist(
  streamId: string,
): Promise<{ entries: AllowlistEntry[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_stream_allowlist", {
    p_stream_id: streamId,
  });

  if (error) {
    if (
      error.message?.includes("list_stream_allowlist") ||
      error.message?.includes("schema cache")
    ) {
      return { entries: [], error: null };
    }
    return { entries: [], error: error.message };
  }

  return {
    entries: (data ?? []).map(
      (row: { email: string; created_at: string }) => ({
        email: row.email,
        createdAt: row.created_at,
      }),
    ),
    error: null,
  };
}

export async function removeAllowlistEmail(
  streamId: string,
  email: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_stream_allowlist_email", {
    p_stream_id: streamId,
    p_email: email,
  });
  return { error: error?.message ?? null };
}
