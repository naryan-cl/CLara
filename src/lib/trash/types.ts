export type TrashKind = "document" | "session";

export type TrashItem = {
  kind: TrashKind;
  id: string;
  title: string;
  /** Document OKF type, or "Session". */
  itemType: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  /** Nested session title for documents; empty for sessions. */
  nestedIn: string | null;
};
