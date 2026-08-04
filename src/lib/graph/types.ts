export type GraphNodeType = "Atom" | "Concept" | "Framework" | "Theme";

export type GraphNode = {
  id: string;
  streamId: string;
  type: GraphNodeType | string;
  label: string;
  description: string | null;
  sourceDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GraphEdge = {
  id: string;
  streamId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string | null;
  sourceDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** LLM extraction proposal shape — see extract-graph.ts. */
export type GraphProposal = {
  nodes: { type: GraphNodeType; label: string; description: string }[];
  edges: { sourceLabel: string; targetLabel: string; relationship: string }[];
};
