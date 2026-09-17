export type StreamSummary = {
  id: string;
  slug: string;
  name: string;
  isolation_enabled: boolean;
  /** `guest` is contribution-only (session-scoped); never a stream_members row. */
  role: "admin" | "member" | "guest";
};

export const DEFAULT_STREAM_SLUG = "camp-clai";
