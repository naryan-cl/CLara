import { createClient } from "@/lib/supabase/server";

/**
 * Attach the signed-in user to Camp CLAI if they have no membership yet.
 * Backed by `ensure_my_camp_clai_membership` (migration 0024). No-ops when
 * the function is missing or the user is already a member.
 */
export async function ensureCampClaiMembership(): Promise<{
  error: string | null;
}> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_my_camp_clai_membership");
  return { error: error?.message ?? null };
}
