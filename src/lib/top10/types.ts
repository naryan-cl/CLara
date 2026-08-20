/**
 * Top 10 Synthesis board — ranked topics, spaces of difference, and
 * questions drawn from Public Commons. Separate from Ask CLara / Reflect.
 */

export type Top10SourceKind = "document" | "session";

export type Top10Source = {
  kind: Top10SourceKind;
  id: string;
  title: string;
  href: string;
  /** Short chip label: Reflection, Transcript, Session, … */
  typeLabel: string | null;
};

export type Top10Item = {
  rank: number;
  label: string;
  /** Extra line — polarity poles, a tension snippet, or a graph blurb. */
  detail: string | null;
  /** Snippet from the originating summary section (shown on expand). */
  evidenceSnippet: string | null;
  /** Distinct Commons places this showed up (same as sources.length). */
  mentionCount: number;
  /**
   * Harmonic closeness on the Knowledge Map (0–1). Ideas that are not on
   * the map score 0 and sort after map-central items.
   */
  closeness: number;
  sources: Top10Source[];
};

export type Top10Board = {
  topics: Top10Item[];
  differences: Top10Item[];
  questions: Top10Item[];
  /** Public, non-draft documents considered. */
  documentCount: number;
  /** Sessions that contributed an inquiry. */
  inquiryCount: number;
};

export type Top10DocumentInput = {
  id: string;
  title: string | null;
  type: string | null;
  tags: unknown;
  summary: string | null;
  createdAt: string;
};

export type Top10SessionInput = {
  id: string;
  name: string;
  seedQuestion: string | null;
};

export type Top10GraphInput = {
  nodes: {
    id: string;
    type: string;
    label: string;
    description: string | null;
    sourceDocumentId: string | null;
  }[];
  edges: {
    sourceNodeId: string;
    targetNodeId: string;
    relationship: string | null;
    sourceDocumentId: string | null;
  }[];
};
