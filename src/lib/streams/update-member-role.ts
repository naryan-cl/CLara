import { createClient } from "@/lib/supabase/server";

export async function updateMemberRole(
  streamId: string,
  userId: string,
  role: "admin" | "member",
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stream_members")
    .update({ role })
    .eq("stream_id", streamId)
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    return { error: error.message };
  }

  // RLS can "succeed" with 0 rows when the caller cannot SELECT the target.
  if (!data?.length) {
    return {
      error:
        "Could not change that member's role. Apply migration 0025 in Supabase if this keeps happening.",
    };
  }

  return { error: null };
}
