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
  /** Lit-state ring color (matches node identity on the diagram). */
  stroke: string;
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
    stroke: "#C97B4A",
    evidenceKey: "client-value-trust",
  },
  {
    id: "cl-expertise-human",
    label: "Our CL Expertise\n(Human)",
    x: 120,
    y: 210,
    radius: 30,
    fill: "#7FA093",
    stroke: "#7FA093",
    evidenceKey: "cl-expertise-human",
  },
  {
    id: "ai-expertise",
    label: "Our Expertise\nwith AI",
    x: 400,
    y: 220,
    radius: 32,
    fill: "#5AAB96",
    stroke: "#4A9A88",
    evidenceKey: "ai-expertise",
  },
  {
    id: "safety-governance",
    label: "Safety &\nGovernance",
    x: 600,
    y: 130,
    radius: 28,
    fill: "#2E4B45",
    stroke: "#2E4B45",
    evidenceKey: "safety-governance",
  },
  {
    id: "tech-infrastructure",
    label: "Tech\ninfrastructure",
    x: 680,
    y: 230,
    radius: 28,
    fill: "#3E6E8E",
    stroke: "#4A8090",
    evidenceKey: "tech-infrastructure",
  },
  {
    id: "support-business-ops",
    label: "Support business\noperations",
    x: 760,
    y: 280,
    radius: 28,
    fill: "#A89070",
    stroke: "#A89070",
    evidenceKey: "support-business-ops",
  },
  {
    id: "culture-language",
    label: "Building our own culture\n& language of AI expertise",
    x: 360,
    y: 340,
    radius: 30,
    fill: "#3E6E8E",
    stroke: "#3E6E8E",
    evidenceKey: "culture-language",
  },
  {
    id: "risks-fears",
    label: "Risks\n& Fears",
    x: 430,
    y: 420,
    radius: 28,
    fill: "#8A8A82",
    stroke: "#8A8A82",
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

export function strokeByNodeId(): Map<string, string> {
  return new Map(GENERATIVE_SYSTEM_NODES.map((n) => [n.id, n.stroke]));
}

export function annotationsForNode(nodeId: string): string[] {
  return GENERATIVE_SYSTEM_EDGES.filter(
    (e) =>
      (e.sourceNodeId === nodeId || e.targetNodeId === nodeId) && e.annotation,
  ).map((e) => e.annotation as string);
}

export type MapBuildStep = {
  title: string;
  nodeIds: string[];
  edgeIds: string[];
  caption: string;
  focusNodeId?: string;
};

/** Progressive reveal order from the original narrative walkthrough. */
export const MAP_BUILD_STEPS: MapBuildStep[] = [
  {
    title: "Our CL expertise",
    nodeIds: ["cl-expertise-human"],
    edgeIds: [],
    focusNodeId: "cl-expertise-human",
    caption:
      "Our CL expertise — somatic depth, culture, strategy, growing in complexity — is who we have been in the adult development world.",
  },
  {
    title: "Client value & trust",
    nodeIds: ["cl-expertise-human", "client-value-trust"],
    edgeIds: ["e3"],
    focusNodeId: "client-value-trust",
    caption:
      "Clients trusted us for human expertise. They now want integrated expertise with AI and technological change — the north star we serve.",
  },
  {
    title: "Expertise with AI",
    nodeIds: ["cl-expertise-human", "client-value-trust", "ai-expertise"],
    edgeIds: ["e3"],
    focusNodeId: "ai-expertise",
    caption:
      "Fluency with AI is uneven across CL — some colleagues surf the edge while others feel overwhelmed and unsure how to talk about it.",
  },
  {
    title: "Risks & fears",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
    ],
    edgeIds: ["e3"],
    focusNodeId: "risks-fears",
    caption:
      "Clumsy AI use risks visible slop and broken trust. Ungrounded adoption can erode our own sensemaking — fears we must name, not ignore.",
  },
  {
    title: "Culture & language",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
      "culture-language",
    ],
    edgeIds: ["e3", "e4", "e1"],
    focusNodeId: "culture-language",
    caption:
      "The AI Petal helps us build shared culture and language — competency through experimentation, learning together without othering or judging.",
  },
  {
    title: "Walking our walk",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
      "culture-language",
    ],
    edgeIds: ["e3", "e4", "e1", "e5", "e6"],
    focusNodeId: "ai-expertise",
    caption:
      "As we learn to build AI expertise, walking our walk becomes what we can offer clients — parallels between our journey and theirs.",
  },
  {
    title: "Safety & governance",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
      "culture-language",
      "safety-governance",
    ],
    edgeIds: ["e3", "e4", "e1", "e5", "e6", "e7"],
    focusNodeId: "safety-governance",
    caption:
      "Safety and governance help us build strongly without stepping into the risks we fear — data sovereignty, approved tools, values-aligned integration.",
  },
  {
    title: "Tech infrastructure",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
      "culture-language",
      "safety-governance",
      "tech-infrastructure",
    ],
    edgeIds: ["e3", "e4", "e1", "e5", "e6", "e7", "e8", "e9", "e2", "e10"],
    focusNodeId: "tech-infrastructure",
    caption:
      "Bespoke infrastructure like CLara accelerates our learning loop. Human design principles guide how AI supports human sensemaking in what we build.",
  },
  {
    title: "Business operations",
    nodeIds: [
      "cl-expertise-human",
      "client-value-trust",
      "ai-expertise",
      "risks-fears",
      "culture-language",
      "safety-governance",
      "tech-infrastructure",
      "support-business-ops",
    ],
    edgeIds: [
      "e3",
      "e4",
      "e1",
      "e5",
      "e6",
      "e7",
      "e8",
      "e9",
      "e2",
      "e10",
      "e11",
      "e12",
      "e13",
    ],
    focusNodeId: "support-business-ops",
    caption:
      "Tools we build can support go-to-market, competitor analysis, and operational efficiency — looping back to how we reach and serve clients safely.",
  },
  {
    title: "The full generative system",
    nodeIds: GENERATIVE_SYSTEM_NODES.map((n) => n.id),
    edgeIds: GENERATIVE_SYSTEM_EDGES.map((e) => e.id),
    focusNodeId: "client-value-trust",
    caption:
      "The whole arc is generative: the more we learn and support that learning, the better we serve clients. The AI Petal holds this process — listening to fear without stalling clarity, finding wholeness across our differences.",
  },
];

/** Layout starting point — same defaults as Knowledge Map. */
export const SYNTHESIS_MAP_LAYOUT = {
  chargeStrength: -260,
  linkDistance: 140,
  linkStrength: 0.25,
  collidePadding: 14,
};
