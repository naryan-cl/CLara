import { createClient } from "@/lib/supabase/server";

export type StreamMember = {
  user_id: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
};

/**
 * Members of a stream, with email. Backed by the `get_stream_members`
 * SECURITY DEFINER function (see 0007_admin_membership.sql) since email
 * lives in auth.users, which the RLS-bound client can't query directly.
 * The function itself checks the caller is an admin of the stream.
 */
export async function listStreamMembers(
  streamId: string,
): Promise<{ members: StreamMember[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_stream_members", {
    p_stream_id: streamId,
  });

  if (error) {
    return { members: [], error: error.message };
  }

  return { members: (data ?? []) as StreamMember[], error: null };
}
