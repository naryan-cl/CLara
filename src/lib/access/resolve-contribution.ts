import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/access/get-access-context";
import type { StreamSummary } from "@/lib/streams/types";

export type ContributionContext =
  | {
      ok: true;
      stream: StreamSummary;
      requiredSessionId: string | null;
      kind: "member" | "guest" | "link_guest";
      userId: string | null;
      linkParticipantId: string | null;
      displayName: string | null;
    }
  | { ok: false; error: string };

/**
 * Stream + session rules for Add (Reflect / Record / Upload).
 * Auth guests and named link guests must nest under their session.
 */
export async function resolveContributionContext(
  sessionIds?: string[],
): Promise<ContributionContext> {
  const access = await getAccessContext();

  if (access.kind === "member" && access.stream) {
    return {
      ok: true,
      stream: access.stream,
      requiredSessionId: null,
      kind: "member",
      userId: access.userId,
      linkParticipantId: null,
      displayName: null,
    };
  }

  if (access.kind === "guest" || access.kind === "link_guest") {
    const requested = sessionIds?.[0]?.trim() || null;
    const match = requested
      ? access.guestSessions.find((session) => session.id === requested)
      : access.guestSessions[0];

    if (requested && !match) {
      return {
        ok: false,
        error:
          access.kind === "link_guest"
            ? "You can only add to the session you joined."
            : "You can only add to a session you have guest access for.",
      };
    }
    if (!match) {
      return {
        ok: false,
        error: "Connect to the session you were invited to before adding.",
      };
    }

    return {
      ok: true,
      stream: {
        id: match.stream_id,
        slug: "camp-clai",
        name: match.streamName,
        isolation_enabled: true,
        role: "guest",
      },
      requiredSessionId: match.id,
      kind: access.kind,
      userId: access.userId,
      linkParticipantId: access.linkParticipantId,
      displayName: access.displayName,
    };
  }

  return {
    ok: false,
    error: "Join the session with a name or sign in before you can add.",
  };
}

/** Guests must nest under their session; members pass through. */
export function normalizeSessionIdsForContribution(
  sessionIds: string[] | undefined,
  requiredSessionId: string | null,
): string[] {
  if (!requiredSessionId) {
    return (sessionIds ?? []).slice(0, 3);
  }
  return [requiredSessionId];
}

export async function resolveStorageStreamId(
  sessionIds?: string[],
): Promise<{ streamId: string } | { error: string }> {
  const resolved = await resolveContributionContext(sessionIds);
  if (!resolved.ok) return { error: resolved.error };
  return { streamId: resolved.stream.id };
}

export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
