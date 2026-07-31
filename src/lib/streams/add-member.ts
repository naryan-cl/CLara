import { createClient } from "@/lib/supabase/server";

/**
 * Add an existing account to a stream by email (stream admins only).
 * Backed by the `add_stream_member_by_email` SECURITY DEFINER function —
 * does not create accounts or send email; the person must already have
 * signed in once.
 */
export async function addStreamMemberByEmail(
  streamId: string,
  email: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("add_stream_member_by_email", {
    p_stream_id: streamId,
    p_email: email.trim(),
  });

  return { error: error?.message ?? null };
}
