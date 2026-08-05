import type { CommonsDocument } from "@/lib/documents/types";
import type { SessionSummary } from "@/lib/sessions/types";

/** Unified row in the Commons repository list. */
export type CommonsDocumentItem = {
  kind: "document";
  id: string;
  title: string;
  type: string | null;
  privacy_status: "public" | "private";
  needs_review: boolean;
  created_at: string;
  created_by: string | null;
  session_id: string | null;
  /** True when the doc's session is one the current user attended. */
  attending: boolean;
  /** Coarse bucket for filters: chat / record / upload / other */
  elementType: "chat" | "record" | "upload" | "other";
};

export type CommonsSessionItem = {
  kind: "session";
  id: string;
  title: string;
  created_at: string;
  occurred_at: string | null;
  created_by: string | null;
  attending: boolean;
  elementType: "session";
};

export type CommonsListItem = CommonsDocumentItem | CommonsSessionItem;

export type CommonsFilterState = {
  elementType: "all" | "chat" | "record" | "upload" | "session" | "other";
  /** ISO date string YYYY-MM-DD inclusive lower bound, or "" */
  dateFrom: string;
  /** ISO date string YYYY-MM-DD inclusive upper bound, or "" */
  dateTo: string;
  attendedOnly: boolean;
  myArtifactsOnly: boolean;
  sort: "newest" | "oldest" | "title";
};

export const DEFAULT_COMMONS_FILTERS: CommonsFilterState = {
  elementType: "all",
  dateFrom: "",
  dateTo: "",
  attendedOnly: false,
  myArtifactsOnly: false,
  sort: "newest",
};

export function documentElementType(
  type: string | null,
): CommonsDocumentItem["elementType"] {
  if (type === "Reflection") return "chat";
  if (type === "Transcript") return "record";
  if (
    type === "Note" ||
    type === "Summary" ||
    type === "Concept" ||
    type === "Framework" ||
    type === "Theme" ||
    type === "Atom"
  ) {
    return "upload";
  }
  return "other";
}

export function toDocumentItem(
  doc: CommonsDocument,
  attending = false,
): CommonsDocumentItem {
  return {
    kind: "document",
    id: doc.id,
    title: doc.title?.trim() || "Untitled",
    type: doc.type,
    privacy_status: doc.privacy_status,
    needs_review: doc.needs_review,
    created_at: doc.created_at,
    created_by: doc.created_by,
    session_id: doc.session_id,
    attending,
    elementType: documentElementType(doc.type),
  };
}

export function toSessionItem(
  session: SessionSummary,
  attending: boolean,
): CommonsSessionItem {
  return {
    kind: "session",
    id: session.id,
    title: session.name,
    created_at: session.created_at,
    occurred_at: session.occurred_at,
    created_by: session.created_by,
    attending,
    elementType: "session",
  };
}

function itemDate(item: CommonsListItem): Date {
  if (item.kind === "session" && item.occurred_at) {
    return new Date(item.occurred_at);
  }
  return new Date(item.created_at);
}

function inDateRange(item: CommonsListItem, from: string, to: string): boolean {
  const d = itemDate(item);
  if (Number.isNaN(d.getTime())) return false;
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (d < start) return false;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`);
    if (d > end) return false;
  }
  return true;
}

/**
 * Pure filter/sort for the Commons list — easy to test without the UI.
 */
export function filterCommonsItems(
  items: CommonsListItem[],
  filters: CommonsFilterState,
  currentUserId: string | null,
): CommonsListItem[] {
  const filtered = items.filter((item) => {
    if (filters.elementType !== "all" && item.elementType !== filters.elementType) {
      return false;
    }
    if (!inDateRange(item, filters.dateFrom, filters.dateTo)) {
      return false;
    }
    if (filters.attendedOnly && !item.attending) {
      return false;
    }
    if (filters.myArtifactsOnly) {
      if (!currentUserId || item.created_by !== currentUserId) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sort === "title") {
      return a.title.localeCompare(b.title);
    }
    const diff = itemDate(a).getTime() - itemDate(b).getTime();
    return filters.sort === "oldest" ? diff : -diff;
  });
}
