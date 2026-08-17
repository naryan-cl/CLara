/**
 * Shared documents.select() list so every query returns the same shape.
 * Why: adding `summary` (or is_draft) in one file and forgetting another
 * made detail views look like the field did not exist.
 */
export const DOCUMENT_SELECT =
  "id, stream_id, created_by, content, summary, title, session_id, type, participants, tags, privacy_status, needs_review, is_draft, created_at, updated_at";
