import { createClient } from "@/lib/supabase/server";

export type StreamGuestRequest = {
  sessionId: string;
  sessionName: string;
  userId: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  source: string | null;
  joinMode: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export async function listStreamGuestRequests(
  streamId: string,
): Promise<{ requests: StreamGuestRequest[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_stream_guest_requests", {
    p_stream_id: streamId,
  });

  if (error) {
    if (
      error.message?.includes("list_stream_guest_requests") ||
      error.message?.includes("schema cache")
    ) {
      return { requests: [], error: null };
    }
    return { requests: [], error: error.message };
  }

  const requests: StreamGuestRequest[] = (data ?? []).map(
    (row: {
      session_id: string;
      session_name: string;
      user_id: string;
      email: string;
      status: string;
      source: string | null;
      join_mode: string | null;
      created_at: string;
      reviewed_at: string | null;
    }) => ({
      sessionId: row.session_id,
      sessionName: row.session_name,
      userId: row.user_id,
      email: row.email,
      status:
        row.status === "approved" || row.status === "rejected"
          ? row.status
          : "pending",
      source: row.source,
      joinMode: row.join_mode,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    }),
  );

  return { requests, error: null };
}

export async function reviewSessionGuestRequest(
  sessionId: string,
  userId: string,
  status: "approved" | "rejected",
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_session_guest_request", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}
