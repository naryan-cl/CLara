import { createClient } from "@/lib/supabase/server";
import {
  coerceSession,
  isMissingHighlightColorSchemaError,
  isMissingJoinCodeSchemaError,
  SESSION_SELECT,
  SESSION_SELECT_LEGACY,
  SESSION_SELECT_NO_HIGHLIGHT,
  type SessionSummary,
} from "@/lib/sessions/types";

export async function getSessionById(
  id: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const supabase = await createClient();

  const primary = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!primary.error) {
    return {
      session: primary.data
        ? coerceSession(primary.data as Record<string, unknown>)
        : null,
      error: null,
    };
  }

  if (isMissingHighlightColorSchemaError(primary.error.message)) {
    const withoutHighlight = await supabase
      .from("sessions")
      .select(SESSION_SELECT_NO_HIGHLIGHT)
      .eq("id", id)
      .maybeSingle();

    if (!withoutHighlight.error) {
      return {
        session: withoutHighlight.data
          ? coerceSession(withoutHighlight.data as Record<string, unknown>)
          : null,
        error: null,
      };
    }
  }

  if (!isMissingJoinCodeSchemaError(primary.error.message)) {
    return { session: null, error: primary.error.message };
  }

  const legacy = await supabase
    .from("sessions")
    .select(SESSION_SELECT_LEGACY)
    .eq("id", id)
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
