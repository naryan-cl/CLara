import { createClient } from "@/lib/supabase/server";

export type GuestAccessOutcome =
  | "member"
  | "approved"
  | "pending"
  | "rejected"
  | "not_found";

export type GuestAccessResult = {
  outcome: GuestAccessOutcome;
  sessionId: string | null;
  sessionName: string | null;
  streamId: string | null;
  joinMode: string | null;
  error: string | null;
};

type RpcRow = {
  outcome: string;
  session_id: string | null;
  session_name: string | null;
  stream_id: string | null;
  join_mode: string | null;
};

export async function requestSessionGuestAccess(
  token: string,
  joinMode: string,
): Promise<GuestAccessResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_session_guest_access", {
    p_token: token,
    p_join_mode: joinMode,
  });

  if (error) {
    if (
      error.message?.includes("request_session_guest_access") ||
      error.message?.includes("schema cache")
    ) {
      return {
        outcome: "not_found",
        sessionId: null,
        sessionName: null,
        streamId: null,
        joinMode,
        error:
          "Session guest access needs migration 0038_session_guest_access.sql.",
      };
    }
    return {
      outcome: "not_found",
      sessionId: null,
      sessionName: null,
      streamId: null,
      joinMode,
      error: error.message,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  if (!row) {
    return {
      outcome: "not_found",
      sessionId: null,
      sessionName: null,
      streamId: null,
      joinMode,
      error: null,
    };
  }

  const outcome = (
    ["member", "approved", "pending", "rejected", "not_found"].includes(
      row.outcome,
    )
      ? row.outcome
      : "not_found"
  ) as GuestAccessOutcome;

  return {
    outcome,
    sessionId: row.session_id,
    sessionName: row.session_name,
    streamId: row.stream_id,
    joinMode: row.join_mode,
    error: null,
  };
}
