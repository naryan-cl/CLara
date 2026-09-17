import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/access/get-access-context";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  coerceSession,
  SESSION_SELECT,
  type SessionSummary,
} from "@/lib/sessions/types";

/**
 * Session + nested docs for the current access kind.
 * Named join-link guests read via service client (no auth RLS).
 */
export async function loadGuestScopedSession(sessionId: string): Promise<{
  session: SessionSummary | null;
  documents: CommonsDocument[];
  error: string | null;
  allowed: boolean;
}> {
  const access = await getAccessContext();

  if (access.kind === "link_guest") {
    const match = access.guestSessions.find((s) => s.id === sessionId);
    if (!match) {
      return {
        session: null,
        documents: [],
        error: "You can only open the session you joined.",
        allowed: false,
      };
    }

    try {
      const admin = createAdminClient();
      const { data: docs, error } = await admin
        .from("documents")
        .select(DOCUMENT_SELECT)
        .eq("session_id", sessionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          session: match,
          documents: [],
          error: error.message,
          allowed: true,
        };
      }

      return {
        session: match,
        documents: (docs ?? []) as CommonsDocument[],
        error: null,
        allowed: true,
      };
    } catch (err) {
      return {
        session: match,
        documents: [],
        error: err instanceof Error ? err.message : "Could not load session.",
        allowed: true,
      };
    }
  }

  const supabase = await createClient();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return {
      session: null,
      documents: [],
      error: sessionError.message,
      allowed: false,
    };
  }
  if (!sessionRow) {
    return { session: null, documents: [], error: null, allowed: false };
  }

  const session = coerceSession(sessionRow as Record<string, unknown>);
  const { data: docs, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("session_id", sessionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return {
    session,
    documents: (docs ?? []) as CommonsDocument[],
    error: error?.message ?? null,
    allowed: true,
  };
}
