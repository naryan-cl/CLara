import { createClient } from "@/lib/supabase/server";

export async function removeStreamMember(
  streamId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stream_members")
    .delete()
    .eq("stream_id", streamId)
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    return { error: error.message };
  }

  if (!data?.length) {
    return {
      error:
        "Could not remove that member. Apply migration 0025 in Supabase if this keeps happening.",
    };
  }

  return { error: null };
}
