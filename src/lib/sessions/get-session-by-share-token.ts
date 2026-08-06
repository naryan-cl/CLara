import { createClient } from "@/lib/supabase/server";
import { SESSION_SELECT, type SessionSummary } from "@/lib/sessions/types";

/** Resolve a share/join token to a session the caller can read (RLS). */
export async function getSessionByShareToken(
  shareToken: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const token = shareToken.trim();
  if (!token) {
    return { session: null, error: "Missing share token." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    return { session: null, error: error.message };
  }

  return { session: (data as SessionSummary | null) ?? null, error: null };
}
