import type { GraphEdge, GraphNode } from "@/lib/graph/types";

/** Canvas coordinate space for the generative system map. */
export const SYNTHESIS_MAP_WIDTH = 860;
export const SYNTHESIS_MAP_HEIGHT = 480;

export type SynthesisMapNodeDef = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  fill: string;
  evidenceKey: string;
};

export const GENERATIVE_SYSTEM_NODES: SynthesisMapNodeDef[] = [
  {
    id: "client-value-trust",
    label: "Client Value\n& Trust",
    x: 430,
    y: 72,
    radius: 36,
    fill: "#C97B4A",
    evidenceKey: "client-value-trust",
  },
  {
    id: "cl-expertise-human",
    label: "Our CL Expertise\n(Human)",
    x: 120,
    y: 210,
    radius: 30,
    fill: "#7FA093",
    evidenceKey: "cl-expertise-human",
  },
  {
    id: "ai-expertise",
    label: "Our Expertise\nwith AI",
    x: 400,
    y: 220,
    radius: 32,
    fill: "#5AAB96",
    evidenceKey: "ai-expertise",
  },
  {
    id: "safety-governance",
    label: "Safety &\nGovernance",
    x: 600,
    y: 130,
    radius: 28,
    fill: "#2E4B45",
    evidenceKey: "safety-governance",
  },
  {
    id: "tech-infrastructure",
    label: "Tech\ninfrastructure",
    x: 680,
    y: 230,
    radius: 28,
    fill: "#3E6E8E",
    evidenceKey: "tech-infrastructure",
  },
  {
    id: "support-business-ops",
    label: "Support business\noperations",
    x: 760,
    y: 280,
    radius: 28,
    fill: "#A89070",
    evidenceKey: "support-business-ops",
  },
  {
    id: "culture-language",
    label: "Building our own culture\n& language of AI expertise",
    x: 360,
    y: 340,
    radius: 30,
    fill: "#3E6E8E",
    evidenceKey: "culture-language",
  },
  {
    id: "risks-fears",
    label: "Risks\n& Fears",
    x: 430,
    y: 420,
    radius: 28,
    fill: "#8A8A82",
    evidenceKey: "risks-fears",
  },
];

export const GENERATIVE_SYSTEM_EDGES: {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  annotation?: string;
}[] = [
  { id: "e1", sourceNodeId: "risks-fears", targetNodeId: "culture-language" },
  {
    id: "e2",
    sourceNodeId: "risks-fears",
    targetNodeId: "tech-infrastructure",
    annotation: "Human design principles / AI supports human sensemaking",
  },
  { id: "e3", sourceNodeId: "cl-expertise-human", targetNodeId: "client-value-trust" },
  { id: "e4", sourceNodeId: "cl-expertise-human", targetNodeId: "culture-language" },
  { id: "e5", sourceNodeId: "culture-language", targetNodeId: "ai-expertise" },
  { id: "e6", sourceNodeId: "ai-expertise", targetNodeId: "client-value-trust" },
  { id: "e7", sourceNodeId: "ai-expertise", targetNodeId: "safety-governance" },
  { id: "e8", sourceNodeId: "safety-governance", targetNodeId: "tech-infrastructure" },
  { id: "e9", sourceNodeId: "ai-expertise", targetNodeId: "tech-infrastructure" },
  { id: "e10", sourceNodeId: "tech-infrastructure", targetNodeId: "ai-expertise" },
  { id: "e11", sourceNodeId: "tech-infrastructure", targetNodeId: "support-business-ops" },
  {
    id: "e12",
    sourceNodeId: "tech-infrastructure",
    targetNodeId: "client-value-trust",
    annotation: "We can build tools that support clients",
  },
  {
    id: "e13",
    sourceNodeId: "support-business-ops",
    targetNodeId: "client-value-trust",
    annotation: "Go-to-market and business development processes",
  },
];

const SYNTHESIS_STREAM = "synthesis-map";

export function toGraphNodes(): GraphNode[] {
  return GENERATIVE_SYSTEM_NODES.map((n) => ({
    id: n.id,
    streamId: SYNTHESIS_STREAM,
    type: "Theme",
    label: n.label.replace(/\n/g, " "),
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  }));
}

export function toGraphEdges(): GraphEdge[] {
  return GENERATIVE_SYSTEM_EDGES.map((e) => ({
    id: e.id,
    streamId: SYNTHESIS_STREAM,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    relationship: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  }));
}

export function anchorByNodeId(): Map<string, { x: number; y: number }> {
  return new Map(
    GENERATIVE_SYSTEM_NODES.map((n) => [n.id, { x: n.x, y: n.y }]),
  );
}

export function radiusByNodeId(): Map<string, number> {
  return new Map(GENERATIVE_SYSTEM_NODES.map((n) => [n.id, n.radius]));
}

export function fillByNodeId(): Map<string, string> {
  return new Map(GENERATIVE_SYSTEM_NODES.map((n) => [n.id, n.fill]));
}

export function annotationsForNode(nodeId: string): string[] {
  return GENERATIVE_SYSTEM_EDGES.filter(
    (e) =>
      (e.sourceNodeId === nodeId || e.targetNodeId === nodeId) && e.annotation,
  ).map((e) => e.annotation as string);
}

/** Softer layout tuned for pinned-anchor synthesis map. */
export const SYNTHESIS_MAP_LAYOUT = {
  chargeStrength: -120,
  linkDistance: 100,
  linkStrength: 0.35,
  collidePadding: 10,
};
