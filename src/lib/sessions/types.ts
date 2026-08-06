export type SessionSummary = {
  id: string;
  stream_id: string;
  name: string;
  occurred_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  seed_question: string | null;
  description: string | null;
  share_token: string;
};

export const SESSION_SELECT =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token";
