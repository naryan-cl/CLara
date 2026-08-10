import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  isMissingJoinCodeSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_LEGACY,
  type SessionSummary,
} from "@/lib/sessions/types";

/** Resolve a share/join token to a session the caller can read (RLS). */
export async function getSessionByShareToken(
  shareToken: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const token = shareToken.trim();
  if (!token) {
    return { session: null, error: "Missing share token." };
  }

  const supabase = await createClient();
  const primary = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("share_token", token)
    .maybeSingle();

  if (!primary.error) {
    return {
      session: primary.data
        ? coerceSession(primary.data as Record<string, unknown>)
        : null,
      error: null,
    };
  }

  if (!isMissingJoinCodeSchemaError(primary.error.message)) {
    return { session: null, error: primary.error.message };
  }

  const legacy = await supabase
    .from("sessions")
    .select(SESSION_SELECT_LEGACY)
    .eq("share_token", token)
    .maybeSingle();

  if (legacy.error) {
    return { session: null, error: legacy.error.message };
  }

  return {
    session: legacy.data
      ? coerceSession(legacy.data as Record<string, unknown>)
      : null,
    error: null,
  };
}
