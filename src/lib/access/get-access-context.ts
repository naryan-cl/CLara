import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getSessionById } from "@/lib/sessions/get-session";
import { getLinkParticipantFromCookie } from "@/lib/access/link-guest";
import type {
  AccessContext,
  GuestSession,
  PendingGuestRequest,
} from "@/lib/access/types";

type GuestRow = {
  session_id: string;
  status: string;
  session_name: string | null;
  join_mode: string | null;
  created_at: string;
};

function emptyContext(
  partial: Partial<AccessContext> & Pick<AccessContext, "kind">,
): AccessContext {
  return {
    userId: null,
    userEmail: null,
    displayName: null,
    linkParticipantId: null,
    stream: null,
    streams: [],
    guestSessions: [],
    pendingRequests: [],
    error: null,
    ...partial,
  };
}

/**
 * Membership vs session-guest vs named link-guest vs waiting. Cached per request.
 */
export const getAccessContext = cache(async (): Promise<AccessContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const linkGuest = await getLinkParticipantFromCookie();
    if (linkGuest) {
      return emptyContext({
        kind: "link_guest",
        displayName: linkGuest.displayName,
        linkParticipantId: linkGuest.id,
        guestSessions: [linkGuest.guestSession],
      });
    }
    return emptyContext({
      kind: "none",
      error: "Not signed in.",
    });
  }

  const { stream, streams, error } = await getActiveStream();
  if (stream) {
    return emptyContext({
      kind: "member",
      userId: user.id,
      userEmail: user.email ?? null,
      stream,
      streams,
      error,
    });
  }

  const { data, error: guestError } = await supabase
    .from("session_guests")
    .select("session_id, status, session_name, join_mode, created_at")
    .eq("user_id", user.id);

  if (guestError) {
    if (
      guestError.message?.includes("session_guests") ||
      guestError.message?.includes("schema cache")
    ) {
      return emptyContext({
        kind: "none",
        userId: user.id,
        userEmail: user.email ?? null,
      });
    }
    return emptyContext({
      kind: "none",
      userId: user.id,
      userEmail: user.email ?? null,
      error: guestError.message,
    });
  }

  const rows = (data ?? []) as GuestRow[];
  const pendingRequests: PendingGuestRequest[] = rows
    .filter((row) => row.status === "pending")
    .map((row) => ({
      sessionId: row.session_id,
      sessionName: row.session_name?.trim() || "a session",
      joinMode: row.join_mode,
      createdAt: row.created_at,
    }));

  const guestSessions: GuestSession[] = [];
  for (const row of rows.filter((r) => r.status === "approved")) {
    const { session } = await getSessionById(row.session_id);
    if (!session) continue;
    const streamRow = await supabase
      .from("streams")
      .select("name")
      .eq("id", session.stream_id)
      .maybeSingle();
    guestSessions.push({
      ...session,
      streamName:
        (streamRow.data?.name as string | undefined)?.trim() || "CLara",
    });
  }

  if (guestSessions.length > 0) {
    return emptyContext({
      kind: "guest",
      userId: user.id,
      userEmail: user.email ?? null,
      guestSessions,
      pendingRequests,
    });
  }

  if (pendingRequests.length > 0) {
    return emptyContext({
      kind: "pending",
      userId: user.id,
      userEmail: user.email ?? null,
      pendingRequests,
    });
  }

  return emptyContext({
    kind: "none",
    userId: user.id,
    userEmail: user.email ?? null,
  });
});
