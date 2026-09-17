import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContributionContext } from "@/lib/access/resolve-contribution";

/**
 * User-scoped client for members/auth guests; service client for named
 * join-link guests (no auth.uid / RLS policies on their path).
 */
export async function getContributionSupabase(
  contribution: Extract<ContributionContext, { ok: true }>,
): Promise<SupabaseClient> {
  if (contribution.kind === "link_guest") {
    return createAdminClient();
  }
  return createClient();
}
