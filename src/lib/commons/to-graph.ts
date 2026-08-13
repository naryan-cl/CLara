import type { CommonsListItem } from "@/lib/commons/types";
import { topLevelCommonsItems } from "@/lib/commons/types";
import type { DocumentLink } from "@/lib/documents/list-document-links";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { recordingProcessLabel } from "@/lib/listens/process-status";

/**
 * Dashboard Commons map uses contribution types — not Knowledge Map
 * Atom/Concept/Framework/Theme extraction vocabulary.
 */
function nodeTypeFor(item: CommonsListItem): string {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return "Upload";
}

function descriptionFor(item: CommonsListItem): string {
  if (item.kind === "session") return "Session in the Commons";
  const bits = [item.type ?? "Document"];
  if (item.privacy_status === "private") bits.push("private");
  if (item.kind === "document") {
    const label = recordingProcessLabel(item.processStatus);
    if (label) bits.push(label.replace("…", "").toLowerCase());
  }
  return bits.join(" · ");
}

function graphNodeId(item: CommonsListItem): string {
  return `${item.kind}:${item.id}`;
}

function toGraphNode(item: CommonsListItem, streamId: string): GraphNode {
  return {
    id: graphNodeId(item),
    streamId,
    type: nodeTypeFor(item),
    label: item.title,
    description: descriptionFor(item),
    sourceDocumentId: item.kind === "document" ? item.id : null,
    createdAt: item.created_at,
    updatedAt: item.created_at,
  };
}

function syntheticEdge(
  id: string,
  streamId: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationship: string,
  sourceDocumentId: string | null,
): GraphEdge {
  return {
    id,
    streamId,
    sourceNodeId,
    targetNodeId,
    relationship,
    sourceDocumentId,
    createdAt: "",
    updatedAt: "",
  };
}

export type CommonsGraphOptions = {
  /** When set, nested Adds for this session appear as nodes with nest lines. */
  expandedSessionId?: string | null;
  /** User-described Relate links; only drawn when both ends are visible. */
  links?: DocumentLink[];
};

/**
 * Turn Commons list items into a lightweight graph for the dashboard map.
 *
 * Default: top-level items only (sessions + ungrouped Adds).
 * Expanded session: that gathering's children join the canvas with nest
 * edges. Relate edges are drawn among whichever nodes are currently visible.
 */
export function commonsItemsToGraph(
  items: CommonsListItem[],
  streamId: string,
  options: CommonsGraphOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const topLevel = topLevelCommonsItems(items);
  const expandedSessionId = options.expandedSessionId?.trim() || null;
  const children =
    expandedSessionId == null
      ? []
      : items.filter(
          (item) =>
            item.kind === "document" && item.session_id === expandedSessionId,
        );

  const visible: CommonsListItem[] = [...topLevel];
  for (const child of children) {
    if (!visible.some((item) => item.kind === child.kind && item.id === child.id)) {
      visible.push(child);
    }
  }

  const nodes = visible.map((item) => toGraphNode(item, streamId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = [];

  if (expandedSessionId) {
    const sessionNodeId = `session:${expandedSessionId}`;
    if (nodeIds.has(sessionNodeId)) {
      for (const child of children) {
        const sourceId = `document:${child.id}`;
        if (!nodeIds.has(sourceId)) continue;
        edges.push(
          syntheticEdge(
            `nest:${child.id}:${expandedSessionId}`,
            streamId,
            sourceId,
            sessionNodeId,
            "nested",
            child.id,
          ),
        );
      }
    }
  }

  for (const link of options.links ?? []) {
    const sourceId = `document:${link.source_document_id}`;
    const targetId = link.target_document_id
      ? `document:${link.target_document_id}`
      : link.target_session_id
        ? `session:${link.target_session_id}`
        : null;
    if (!targetId) continue;
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
    edges.push(
      syntheticEdge(
        `relate:${link.source_document_id}:${targetId}`,
        streamId,
        sourceId,
        targetId,
        "related",
        link.source_document_id,
      ),
    );
  }

  return { nodes, edges };
}
