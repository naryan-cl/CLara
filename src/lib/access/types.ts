import type { SessionSummary } from "@/lib/sessions/types";
import type { StreamSummary } from "@/lib/streams/types";

export type AccessKind =
  | "member"
  | "guest"
  | "link_guest"
  | "pending"
  | "none";

export type PendingGuestRequest = {
  sessionId: string;
  sessionName: string;
  joinMode: string | null;
  createdAt: string;
};

export type GuestSession = SessionSummary & {
  streamName: string;
};

export type AccessContext = {
  kind: AccessKind;
  userId: string | null;
  userEmail: string | null;
  /** Named join-link guest display name (no account). */
  displayName: string | null;
  /** session_link_participants.id when kind is link_guest. */
  linkParticipantId: string | null;
  stream: StreamSummary | null;
  streams: StreamSummary[];
  guestSessions: GuestSession[];
  pendingRequests: PendingGuestRequest[];
  error: string | null;
};
