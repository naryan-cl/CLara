import { getUserPublicProfiles } from "@/lib/comments";
import type { UserPublicProfile } from "@/lib/comments/types";
import { listSessionParticipantIds } from "@/lib/sessions/add-session-participant";

/**
 * Display names for everyone marked on a session (join / I Attended).
 * Why: detail views should show people, not user UUIDs.
 */
export async function listSessionAttendeeProfiles(
  sessionId: string,
): Promise<{ attendees: UserPublicProfile[]; error: string | null }> {
  const { userIds, error } = await listSessionParticipantIds(sessionId);
  if (error) {
    return { attendees: [], error };
  }
  if (userIds.length === 0) {
    return { attendees: [], error: null };
  }

  const { profiles, error: profileError } = await getUserPublicProfiles(userIds);
  if (profileError) {
    return { attendees: [], error: profileError };
  }

  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return {
    attendees: userIds.map(
      (id) =>
        byId.get(id) ?? {
          user_id: id,
          email: null,
          display_name: "Member",
          avatar_url: null,
        },
    ),
    error: null,
  };
}
