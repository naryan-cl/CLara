import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LINK_GUEST_COOKIE,
  LINK_GUEST_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/access/link-guest-cookie";
import { coerceSession, SESSION_SELECT } from "@/lib/sessions/types";
import type { GuestSession } from "@/lib/access/types";

export type LinkParticipant = {
  id: string;
  sessionId: string;
  streamId: string;
  displayName: string;
  joinMode: string | null;
  deviceToken: string;
  guestSession: GuestSession;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
  device_token: string;
  join_mode: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function readLinkGuestToken(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(LINK_GUEST_COOKIE)?.value?.trim() ?? "";
  if (!raw || !isUuid(raw)) return null;
  return raw;
}

export async function setLinkGuestCookie(deviceToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(LINK_GUEST_COOKIE, deviceToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LINK_GUEST_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearLinkGuestCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(LINK_GUEST_COOKIE);
}

/**
 * Resolve the named join-link participant from the httpOnly cookie.
 * Uses the service client (no RLS policies on this table by design).
 */
export async function getLinkParticipantFromCookie(): Promise<LinkParticipant | null> {
  const token = await readLinkGuestToken();
  if (!token) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("session_link_participants")
    .select("id, session_id, display_name, device_token, join_mode")
    .eq("device_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ParticipantRow;

  const { data: sessionRow, error: sessionError } = await admin
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", row.session_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (sessionError || !sessionRow) return null;

  const session = coerceSession(sessionRow as Record<string, unknown>);

  const { data: streamRow } = await admin
    .from("streams")
    .select("name")
    .eq("id", session.stream_id)
    .maybeSingle();

  const streamName =
    (streamRow?.name as string | undefined)?.trim() || "CLara";

  void admin
    .from("session_link_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    id: row.id,
    sessionId: row.session_id,
    streamId: session.stream_id,
    displayName: row.display_name.trim(),
    joinMode: row.join_mode,
    deviceToken: row.device_token,
    guestSession: {
      ...session,
      streamName,
    },
  };
}

export type PublicJoinSession = {
  sessionId: string;
  streamId: string;
  name: string;
  joinCode: string | null;
  seedQuestion: string | null;
};

export async function lookupJoinSessionPublic(
  token: string,
): Promise<PublicJoinSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_join_session_public", {
    p_token: token,
  });

  if (error) {
    // Fallback via admin if migration not applied yet / RPC missing.
    try {
      const admin = createAdminClient();
      const trimmed = token.trim();
      const code = trimmed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      let query = admin
        .from("sessions")
        .select("id, stream_id, name, join_code, seed_question")
        .is("deleted_at", null)
        .limit(1);

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          trimmed,
        );
      if (isUuid) {
        query = query.eq("share_token", trimmed);
      } else if (code.length >= 4) {
        query = query.eq("join_code", code);
      } else {
        return null;
      }

      const { data: row } = await query.maybeSingle();
      if (!row) return null;
      return {
        sessionId: row.id as string,
        streamId: row.stream_id as string,
        name: row.name as string,
        joinCode: (row.join_code as string | null) ?? null,
        seedQuestion: (row.seed_question as string | null) ?? null,
      };
    } catch {
      return null;
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    session_id: string;
    stream_id: string;
    name: string;
    join_code: string | null;
    seed_question: string | null;
  } | null;

  if (!row?.session_id) return null;

  return {
    sessionId: row.session_id,
    streamId: row.stream_id,
    name: row.name,
    joinCode: row.join_code,
    seedQuestion: row.seed_question,
  };
}

export async function joinAsLinkParticipant(input: {
  token: string;
  displayName: string;
  joinMode: string;
}): Promise<
  | {
      ok: true;
      participantId: string;
      deviceToken: string;
      sessionId: string;
      sessionName: string;
      streamId: string;
      joinMode: string;
      displayName: string;
    }
  | { ok: false; error: string }
> {
  const name = input.displayName.trim().slice(0, 80);
  if (!name) {
    return { ok: false, error: "Enter a display name to continue." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_as_link_participant", {
    p_token: input.token,
    p_display_name: name,
    p_join_mode: input.joinMode,
  });

  if (error) {
    if (
      error.message?.includes("join_as_link_participant") ||
      error.message?.includes("schema cache")
    ) {
      return {
        ok: false,
        error:
          "Named join guests need migration 0039_session_link_participants.sql.",
      };
    }
    return { ok: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    participant_id: string;
    device_token: string;
    session_id: string;
    session_name: string;
    stream_id: string;
    join_mode: string;
    display_name: string;
  } | null;

  if (!row?.participant_id || !row.device_token) {
    return { ok: false, error: "Session not found." };
  }

  return {
    ok: true,
    participantId: row.participant_id,
    deviceToken: row.device_token,
    sessionId: row.session_id,
    sessionName: row.session_name,
    streamId: row.stream_id,
    joinMode: row.join_mode,
    displayName: row.display_name,
  };
}

export async function resolveGuestParticipantProfiles(
  participantIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(participantIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return map;
  }

  const { data } = await admin
    .from("session_link_participants")
    .select("id, display_name")
    .in("id", unique);

  for (const row of data ?? []) {
    const id = row.id as string;
    const name = (row.display_name as string | null)?.trim();
    if (id && name) map.set(id, name);
  }
  return map;
}
