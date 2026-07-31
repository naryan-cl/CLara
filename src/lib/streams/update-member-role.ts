import { createClient } from "@/lib/supabase/server";

export async function updateMemberRole(
  streamId: string,
  userId: string,
  role: "admin" | "member",
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("stream_members")
    .update({ role })
    .eq("stream_id", streamId)
    .eq("user_id", userId);

  return { error: error?.message ?? null };
}
