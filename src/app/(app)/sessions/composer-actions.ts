"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createSession } from "@/lib/sessions/create-session";
import { listSessions } from "@/lib/sessions/list-sessions";
import { setSessionRelations } from "@/lib/sessions/set-session-relations";
import {
  addSessionParticipant,
  listSessionParticipantIds,
} from "@/lib/sessions/add-session-participant";
import { listStreamPeers, type StreamPeer } from "@/lib/streams/list-stream-peers";
import type { SessionSummary } from "@/lib/sessions/types";
import { markAttended } from "@/lib/sessions/attendance";

export type SessionComposerBootstrap = {
  sessions: SessionSummary[];
  peers: StreamPeer[];
  streamId: string | null;
  error: string | null;
};

/** Load sessions + peers for the Session Composer on Add pages. */
export async function loadSessionComposerData(): Promise<SessionComposerBootstrap> {
  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      sessions: [],
      peers: [],
      streamId: null,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const [sessionsResult, peersResult] = await Promise.all([
    listSessions(stream.id),
    listStreamPeers(stream.id),
  ]);

  return {
    sessions: sessionsResult.sessions,
    peers: peersResult.peers,
    streamId: stream.id,
    error: sessionsResult.error ?? peersResult.error,
  };
}

export type CreateGroupSessionResult =
  | {
      ok: true;
      session: SessionSummary;
      joinPath: string;
    }
  | { ok: false; error: string };

/**
 * Create a session from Reflect / Record / Upload ("Create group reflection"
 * or "Create session"). Optionally links related sessions and participants.
 */
export async function createGroupSession(input: {
  name: string;
  seedQuestion?: string;
  description?: string;
  relatedSessionIds?: string[];
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

  const { session, error } = await createSession({
    streamId: stream.id,
    createdBy: user.id,
    name: input.name,
    seedQuestion: input.seedQuestion,
    description: input.description,
  });

  if (error || !session) {
    return { ok: false, error: error ?? "Could not create session." };
  }

  if (input.relatedSessionIds?.length) {
    const relError = await setSessionRelations(
      session.id,
      input.relatedSessionIds,
    );
    if (relError.error) {
      return { ok: false, error: relError.error };
    }
  }

  // Creator is a participant; then any manually added peers.
  await markAttended(session.id, user.id);

  for (const peerId of input.participantUserIds ?? []) {
    if (peerId === user.id) continue;
    const addError = await addSessionParticipant(session.id, peerId);
    if (addError.error) {
      return { ok: false, error: addError.error };
    }
  }

  return {
    ok: true,
    session,
    joinPath: `/join/${session.share_token}`,
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
