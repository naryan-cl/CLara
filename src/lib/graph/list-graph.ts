import { createClient } from "@/lib/supabase/server";
import type { GraphEdge, GraphNode } from "./types";

type NodeRow = {
  id: string;
  stream_id: string;
  type: string;
  label: string;
  description: string | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
};

type EdgeRow = {
  id: string;
  stream_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship: string | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Request-scoped (RLS-bound) read of one stream's Knowledge Map. Safe to
 * call from a Server Component — the member-read policies on `nodes`/
 * `edges` (0010) do the stream scoping, no admin client needed.
 */
export async function listGraph(
  streamId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; error: string | null }> {
  const supabase = await createClient();

  const [{ data: nodeRows, error: nodeError }, { data: edgeRows, error: edgeError }] =
    await Promise.all([
      supabase.from("nodes").select("*").eq("stream_id", streamId),
      supabase.from("edges").select("*").eq("stream_id", streamId),
    ]);

  if (nodeError) {
    return { nodes: [], edges: [], error: nodeError.message };
  }
  if (edgeError) {
    return { nodes: [], edges: [], error: edgeError.message };
  }

  const mappedNodes: GraphNode[] = ((nodeRows ?? []) as NodeRow[]).map(
    (row) => ({
      id: row.id,
      streamId: row.stream_id,
      type: row.type,
      label: row.label,
      description: row.description,
      sourceDocumentId: row.source_document_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );

  const mappedEdges: GraphEdge[] = ((edgeRows ?? []) as EdgeRow[]).map(
    (row) => ({
      id: row.id,
      streamId: row.stream_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      relationship: row.relationship,
      sourceDocumentId: row.source_document_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );

  // Knowledge Map nodes stay in the table after a Delete; hide any whose
  // source document is in Trash (RLS will not return that document id).
  const sourceIds = [
    ...new Set(
      [...mappedNodes, ...mappedEdges]
        .map((item) => item.sourceDocumentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let liveSourceIds = new Set<string>();
  if (sourceIds.length > 0) {
    const { data: liveDocs, error: liveError } = await supabase
      .from("documents")
      .select("id")
      .in("id", sourceIds);
    if (liveError) {
      return { nodes: [], edges: [], error: liveError.message };
    }
    liveSourceIds = new Set((liveDocs ?? []).map((row) => String(row.id)));
  }

  const nodes = mappedNodes.filter(
    (node) =>
      !node.sourceDocumentId || liveSourceIds.has(node.sourceDocumentId),
  );
  const liveNodeIds = new Set(nodes.map((node) => node.id));
  const edges = mappedEdges.filter((edge) => {
    if (!liveNodeIds.has(edge.sourceNodeId) || !liveNodeIds.has(edge.targetNodeId)) {
      return false;
    }
    if (!edge.sourceDocumentId) return true;
    return liveSourceIds.has(edge.sourceDocumentId);
  });

  return { nodes, edges, error: null };
}
