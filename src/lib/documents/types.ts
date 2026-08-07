export type DocumentPrivacy = "public" | "private";

/** OKF Type values from prd-v0.4.md — stored as text for flexibility. */
export type OkfDocumentType =
  | "Reflection"
  | "Note"
  | "Transcript"
  | "Summary"
  | "Atom"
  | "Concept"
  | "Framework"
  | "Theme"
  | string;

export type CommonsDocument = {
  id: string;
  stream_id: string;
  created_by: string | null;
  content: string;
  title: string | null;
  /** FK into `sessions.id` (nullable) — see src/lib/sessions. */
  session_id: string | null;
  type: OkfDocumentType | null;
  participants: unknown;
  tags: unknown;
  privacy_status: DocumentPrivacy;
  needs_review: boolean;
  /** Reflect autosave until Submit. Absent/false for older rows. */
  is_draft?: boolean;
  created_at: string;
  updated_at: string;
};
