import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";

/** Mark the current user attended a session. Idempotent (re-marking is a no-op). */
export async function markAttended(
  sessionId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("session_attendees")
    .insert({ session_id: sessionId, user_id: userId });

  if (error && error.code !== UNIQUE_VIOLATION) {
    return { error: error.message };
  }

  return { error: null };
}

/** Unmark the current user's attendance for a session. */
export async function unmarkAttended(
  sessionId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("session_attendees")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  return { error: error?.message ?? null };
}

/** Whether the current user has marked themselves attended for a session. */
export async function isAttending(
  sessionId: string,
  userId: string,
): Promise<{ attending: boolean; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("session_attendees")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { attending: false, error: error.message };
  }

  return { attending: data !== null, error: null };
}

/** Every session in a stream the current user has marked themselves attended for. */
export async function listAttendedSessionIds(
  userId: string,
  streamId: string,
): Promise<{ sessionIds: string[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("session_attendees")
    .select("session_id, sessions!inner(stream_id)")
    .eq("user_id", userId)
    .eq("sessions.stream_id", streamId);

  if (error) {
    return { sessionIds: [], error: error.message };
  }

  return {
    sessionIds: (data ?? []).map((row) => row.session_id as string),
    error: null,
  };
}
