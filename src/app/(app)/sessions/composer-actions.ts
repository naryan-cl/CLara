"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createSession } from "@/lib/sessions/create-session";
import { listSessions } from "@/lib/sessions/list-sessions";
import { getSessionById } from "@/lib/sessions/get-session";
import { getSessionByJoinCode } from "@/lib/sessions/get-session-by-join-code";
import { getSessionLiveCounts } from "@/lib/sessions/live-counts";
import {
  addSessionParticipant,
  listSessionParticipantIds,
} from "@/lib/sessions/add-session-participant";
import { listStreamPeers, type StreamPeer } from "@/lib/streams/list-stream-peers";
import {
  joinPathForSession,
  type JoinMode,
  type SessionSummary,
} from "@/lib/sessions/types";
import { markAttended } from "@/lib/sessions/attendance";
import { updateSessionJoinCode } from "@/lib/sessions/update-join-code";
import { inngest, CLARA_SESSION_FINALIZED } from "@/lib/inngest/client";
import {
  listRelateTargets,
  type RelateTarget,
} from "@/lib/commons/relate-targets";

export type SessionComposerBootstrap = {
  sessions: SessionSummary[];
  peers: StreamPeer[];
  relateTargets: RelateTarget[];
  streamId: string | null;
  error: string | null;
};

/** Load sessions + peers + relate targets for Connect on Add pages. */
export async function loadSessionComposerData(): Promise<SessionComposerBootstrap> {
  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      sessions: [],
      peers: [],
      relateTargets: [],
      streamId: null,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const [sessionsResult, peersResult, commonsResult] = await Promise.all([
    listSessions(stream.id),
    listStreamPeers(stream.id),
    listRelateTargets(stream.id),
  ]);

  return {
    sessions: sessionsResult.sessions,
    peers: peersResult.peers,
    relateTargets: commonsResult,
    streamId: stream.id,
    error: sessionsResult.error ?? peersResult.error,
  };
}

export type CreateGroupSessionResult =
  | {
      ok: true;
      session: SessionSummary;
      joinPath: string;
      warning?: string;
    }
  | { ok: false; error: string };

/**
 * Create a gathering from Add → Session (host flow).
 * Reflect/Record/Upload no longer call this.
 */
export async function createGroupSession(input: {
  name: string;
  /** Stored as sessions.seed_question — shown as Inquiry in the UI. */
  inquiry?: string;
  seedQuestion?: string;
  participantUserIds?: string[];
}): Promise<CreateGroupSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      ok: false,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const inquiry = (input.inquiry ?? input.seedQuestion ?? "").trim();

  const { session, error } = await createSession({
    streamId: stream.id,
    createdBy: user.id,
    name: input.name,
    seedQuestion: inquiry || null,
    description: null,
  });

  if (error || !session) {
    return { ok: false, error: error ?? "Could not create session." };
  }

  const attended = await markAttended(session.id, user.id);
  const warnings: string[] = [];
  if (attended.error) {
    warnings.push(`Could not mark you as a participant: ${attended.error}`);
  }

  for (const peerId of input.participantUserIds ?? []) {
    if (peerId === user.id) continue;
    const addError = await addSessionParticipant(session.id, peerId);
    if (addError.error) {
      warnings.push(`Could not add a participant: ${addError.error}`);
    }
  }

  return {
    ok: true,
    session,
    joinPath: joinPathForSession(session.join_code, "reflect"),
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}

export async function addParticipantsToSession(
  sessionId: string,
  userIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  for (const userId of userIds) {
    const { error } = await addSessionParticipant(sessionId, userId);
    if (error) {
      return { ok: false, error };
    }
  }

  return { ok: true };
}

export async function listParticipantsForSession(
  sessionId: string,
): Promise<{ userIds: string[]; error: string | null }> {
  return listSessionParticipantIds(sessionId);
}

export async function resolveJoinCodeAction(
  code: string,
): Promise<
  | { ok: true; session: SessionSummary }
  | { ok: false; error: string }
> {
  const { session, error } = await getSessionByJoinCode(code);
  if (error || !session) {
    return { ok: false, error: error ?? "Session not found." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await markAttended(session.id, user.id);
  }

  return { ok: true, session };
}

export async function loadSessionLiveBoard(
  sessionId: string,
): Promise<
  | {
      ok: true;
      session: SessionSummary;
      counts: { inProgress: number; submitted: number };
      joinPaths: Record<JoinMode, string>;
    }
  | { ok: false; error: string }
> {
  const { session, error } = await getSessionById(sessionId);
  if (error || !session) {
    return { ok: false, error: error ?? "Session not found." };
  }

  const { counts, error: countError } = await getSessionLiveCounts(sessionId);
  if (countError) {
    return { ok: false, error: countError };
  }

  return {
    ok: true,
    session,
    counts,
    joinPaths: {
      reflect: joinPathForSession(session.join_code, "reflect"),
      record: joinPathForSession(session.join_code, "record"),
      upload: joinPathForSession(session.join_code, "upload"),
    },
  };
}

export async function pollSessionLiveCounts(sessionId: string): Promise<{
  counts: { inProgress: number; submitted: number };
  finalizedAt: string | null;
  error: string | null;
}> {
  const [{ counts, error }, sessionResult] = await Promise.all([
    getSessionLiveCounts(sessionId),
    getSessionById(sessionId),
  ]);

  return {
    counts,
    finalizedAt: sessionResult.session?.finalized_at ?? null,
    error: error ?? sessionResult.error,
  };
}

/** Host-only: set a custom short join code; refreshes share paths. */
export async function updateSessionJoinCodeAction(
  sessionId: string,
  joinCode: string,
) {
  return updateSessionJoinCode(sessionId, joinCode);
}

/**
 * Soft-close: mark finalized, enqueue session synthesis. Still accepts Adds.
 */
export async function finalizeSessionGathering(
  sessionId: string,
): Promise<
  | { ok: true; sessionId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { session, error } = await getSessionById(sessionId);
  if (error || !session) {
    return { ok: false, error: error ?? "Session not found." };
  }

  if (session.created_by && session.created_by !== user.id) {
    // Allow stream admins — soft check via membership role if needed later.
    const { data: membership } = await supabase
      .from("stream_members")
      .select("role")
      .eq("stream_id", session.stream_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "admin" && session.created_by !== user.id) {
      return { ok: false, error: "Only the host or a stream admin can finalize." };
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("sessions")
    .update({ finalized_at: now })
    .eq("id", sessionId);

  if (updateError) {
    if (
      updateError.message?.includes("finalized_at") ||
      updateError.message?.includes("schema cache")
    ) {
      // Migration missing — still enqueue synthesis best-effort.
    } else {
      return { ok: false, error: updateError.message };
    }
  }

  try {
    void inngest.send({
      name: CLARA_SESSION_FINALIZED,
      data: {
        sessionId: session.id,
        streamId: session.stream_id,
      },
    });
  } catch {
    // Fire-and-forget — do not block host celebration.
  }

  return { ok: true, sessionId: session.id };
}
