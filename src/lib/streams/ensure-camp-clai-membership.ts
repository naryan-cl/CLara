import { createClient } from "@/lib/supabase/server";

/**
 * Attach the signed-in user to Camp CLAI when their email is
 * @cultivatingleadership.com or on the stream allowlist (migration 0038).
 * No-ops for other domains — those need admin approval or session-guest access.
 */
export async function ensureCampClaiMembership(): Promise<{
  error: string | null;
}> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_my_camp_clai_membership");
  return { error: error?.message ?? null };
}
