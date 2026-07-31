import { createClient } from "@/lib/supabase/server";

export async function removeStreamMember(
  streamId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("stream_members")
    .delete()
    .eq("stream_id", streamId)
    .eq("user_id", userId);

  return { error: error?.message ?? null };
}
