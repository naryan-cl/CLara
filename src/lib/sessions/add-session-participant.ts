import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";

/** Add a stream member as a session participant/attendee (creator or self). */
export async function addSessionParticipant(
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

export type SessionParticipant = {
  user_id: string;
};

export async function listSessionParticipantIds(
  sessionId: string,
): Promise<{ userIds: string[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("session_attendees")
    .select("user_id")
    .eq("session_id", sessionId);

  if (error) {
    return { userIds: [], error: error.message };
  }

  return {
    userIds: (data ?? []).map((row) => row.user_id as string),
    error: null,
  };
}
