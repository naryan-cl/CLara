/**
 * Shared Knowledge Map / Dashboard node vocabulary.
 * Colors and plain-language definitions live here so the canvas, legend,
 * and hover tips stay in sync (DESIGN_GUIDE.md). Size on `/map` is closeness.
 */

export const KNOWLEDGE_MAP_NODE_TYPES = [
  "Atom",
  "Concept",
  "Framework",
  "Theme",
] as const;

export const DASHBOARD_NODE_TYPES = [
  "Session",
  "Chat",
  "Record",
  "Upload",
] as const;

export type KnowledgeMapNodeType = (typeof KNOWLEDGE_MAP_NODE_TYPES)[number];
export type DashboardNodeType = (typeof DASHBOARD_NODE_TYPES)[number];

/** CSS color tokens — same mapping KnowledgeMap uses to fill circles. */
export const NODE_COLOR: Record<string, string> = {
  Concept: "var(--glow)",
  Framework: "var(--horizon)",
  Theme: "var(--ember)",
  Atom: "var(--sage)",
  Session: "var(--horizon)",
  Chat: "var(--glow)",
  Record: "var(--ember)",
  Upload: "var(--sage)",
};

export const NODE_TYPE_GLOSSARY = {
  Atom: "A single raw observation, quote, or data point pulled from a Commons document.",
  Concept: "A named idea — often a cluster of related atoms.",
  Framework: "A named model or method people are using (a ladder, loop, canvas, and so on).",
  Theme: "A recurring topic that shows up across conversations.",
  Session: "An intentional gathering. Nested Reflect, Record, and Upload sit under it.",
  Chat: "A written reflection from Reflect (CLara Chatbot).",
  Record: "An audio recording that became a transcript.",
  Upload: "A file or pasted document added to the Commons.",
} as const;

export function colorForNodeType(type: string): string {
  return NODE_COLOR[type] ?? "var(--sage)";
}

export function glossaryForNodeType(type: string): string | null {
  if (type in NODE_TYPE_GLOSSARY) {
    return NODE_TYPE_GLOSSARY[type as keyof typeof NODE_TYPE_GLOSSARY];
  }
  return null;
}
