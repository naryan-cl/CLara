import type { SessionSummary } from "@/lib/sessions/types";

/**
 * Gatherings still accepting Adds (not finalized), newest created first.
 * Why: Connect can nest without a join code; the host’s latest session
 * should be the first thing people see in the dropdown.
 */
export function openSessionsNewestFirst(
  sessions: SessionSummary[],
): SessionSummary[] {
  return sessions
    .filter((session) => session.finalized_at == null)
    .slice()
    .sort((a, b) => {
      if (a.created_at === b.created_at) return 0;
      return a.created_at < b.created_at ? 1 : -1;
    });
}
