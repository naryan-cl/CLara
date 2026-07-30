export type StreamSummary = {
  id: string;
  slug: string;
  name: string;
  isolation_enabled: boolean;
  role: "admin" | "member";
};

export const DEFAULT_STREAM_SLUG = "camp-clai";
