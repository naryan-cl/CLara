import { parseSummaryBrief, splitPolarity } from "./parse-summary";
import {
  asStringList,
  displayLabel,
  documentHref,
  documentTitle,
  documentTypeLabel,
  looksEmpty,
  normalizeLabel,
  sessionHref,
} from "./normalize";
import {
  closenessByNormalizedLabel,
  harmonicClosenessById,
} from "@/lib/graph/closeness";
import type {
  Top10Board,
  Top10DocumentInput,
  Top10GraphInput,
  Top10Item,
  Top10SessionInput,
  Top10Source,
} from "./types";

export const TOP10_LIMIT = 10;
const MAX_SOURCES_PER_ITEM = 12;

const CONTRAST_RELATIONSHIP =
  /contrast|versus|\bvs\.?\b|tension|polarity|differ|oppos|trade-?off|counter|conflict|polar/i;

type Cluster = {
  labelCounts: Map<string, number>;
  detail: string | null;
  evidenceSnippet: string | null;
  sources: Top10Source[];
  seen: Set<string>;
};

function sourceKey(source: Top10Source): string {
  return `${source.kind}:${source.id}`;
}

function emptyCluster(): Cluster {
  return {
    labelCounts: new Map(),
    detail: null,
    evidenceSnippet: null,
    sources: [],
    seen: new Set(),
  };
}

function addSource(cluster: Cluster, source: Top10Source): void {
  const key = sourceKey(source);
  if (cluster.seen.has(key)) return;
  cluster.seen.add(key);
  if (cluster.sources.length >= MAX_SOURCES_PER_ITEM) return;
  cluster.sources.push(source);
}

function noteEvidence(cluster: Cluster, snippet: string): void {
  const trimmed = displayLabel(snippet);
  if (!trimmed || looksEmpty(trimmed)) return;
  if (!cluster.evidenceSnippet) {
    cluster.evidenceSnippet =
      trimmed.length > 220 ? `${trimmed.slice(0, 217)}…` : trimmed;
  }
  if (!cluster.detail) {
    cluster.detail = trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  }
}

function bumpLabel(cluster: Cluster, label: string): void {
  const trimmed = displayLabel(label);
  if (!trimmed) return;
  cluster.labelCounts.set(trimmed, (cluster.labelCounts.get(trimmed) ?? 0) + 1);
}

function bestLabel(cluster: Cluster, fallback: string): string {
  let winner = fallback;
  let best = -1;
  for (const [label, count] of cluster.labelCounts) {
    if (
      count > best ||
      (count === best && label.length < winner.length)
    ) {
      best = count;
      winner = label;
    }
  }
  return winner;
}

function closenessForKey(
  key: string,
  closenessByLabel: Map<string, number>,
): number {
  if (key.includes("↔")) {
    const parts = key.split("↔").map((part) => part.trim());
    let best = 0;
    for (const part of parts) {
      const score = closenessByLabel.get(part) ?? 0;
      if (score > best) best = score;
    }
    return best;
  }
  return closenessByLabel.get(key) ?? 0;
}

function toItems(
  clusters: Map<string, Cluster>,
  closenessByLabel: Map<string, number>,
): Top10Item[] {
  const ranked = [...clusters.entries()]
    .map(([key, cluster]) => ({
      key,
      label: bestLabel(cluster, key),
      detail: cluster.detail,
      evidenceSnippet: cluster.evidenceSnippet,
      mentionCount: cluster.sources.length,
      closeness: closenessForKey(key, closenessByLabel),
      sources: cluster.sources,
    }))
    .filter((item) => item.mentionCount > 0)
    .sort((a, b) => {
      if (b.closeness !== a.closeness) {
        return b.closeness - a.closeness;
      }
      if (b.mentionCount !== a.mentionCount) {
        return b.mentionCount - a.mentionCount;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, TOP10_LIMIT);

  return ranked.map((item, index) => ({
    rank: index + 1,
    label: item.label,
    detail: item.detail && item.detail !== item.label ? item.detail : null,
    evidenceSnippet: item.evidenceSnippet,
    mentionCount: item.mentionCount,
    closeness: item.closeness,
    sources: item.sources,
  }));
}

function documentSource(doc: Top10DocumentInput): Top10Source {
  return {
    kind: "document",
    id: doc.id,
    title: documentTitle(doc.title, doc.type),
    href: documentHref(doc.id),
    typeLabel: documentTypeLabel(doc.type),
  };
}

function sessionSource(session: Top10SessionInput): Top10Source {
  return {
    kind: "session",
    id: session.id,
    title: session.name.trim() || "Untitled session",
    href: sessionHref(session.id),
    typeLabel: "Session",
  };
}

function getOrCreate(map: Map<string, Cluster>, key: string): Cluster {
  const existing = map.get(key);
  if (existing) return existing;
  const created = emptyCluster();
  map.set(key, created);
  return created;
}

function polarityKey(left: string, right: string): string {
  return [normalizeLabel(left), normalizeLabel(right)].sort().join("↔");
}

/**
 * Rank Top 10 lists from already-loaded Commons evidence.
 * Order is SNA closeness on the Knowledge Map, then mention count.
 * Pure: no I/O, so it is easy to reason about (and unit-test later).
 */
export function rankTop10(input: {
  documents: Top10DocumentInput[];
  sessions: Top10SessionInput[];
  graph?: Top10GraphInput | null;
}): Top10Board {
  const topics = new Map<string, Cluster>();
  const differences = new Map<string, Cluster>();
  const questions = new Map<string, Cluster>();
  const docsById = new Map(input.documents.map((doc) => [doc.id, doc]));

  for (const doc of input.documents) {
    const source = documentSource(doc);
    const parsed = parseSummaryBrief(doc.summary);
    const tags = uniqueLabels([
      ...asStringList(doc.tags).map(displayLabel),
      ...parsed.themeTags,
    ]);

    for (const tag of tags) {
      const key = normalizeLabel(tag);
      if (!key) continue;
      const cluster = getOrCreate(topics, key);
      bumpLabel(cluster, tag);
      noteEvidence(cluster, tag);
      addSource(cluster, source);
    }

    for (const tension of parsed.tensions) {
      const pair = splitPolarity(tension);
      if (pair) {
        const key = polarityKey(pair[0], pair[1]);
        const cluster = getOrCreate(differences, key);
        bumpLabel(cluster, `${pair[0]} ↔ ${pair[1]}`);
        if (!cluster.detail && tension !== `${pair[0]} ↔ ${pair[1]}`) {
          cluster.detail = displayLabel(tension);
        }
        noteEvidence(cluster, tension);
        addSource(cluster, source);
      } else {
        const key = normalizeLabel(tension);
        if (!key) continue;
        const cluster = getOrCreate(differences, key);
        bumpLabel(cluster, tension);
        noteEvidence(cluster, tension);
        addSource(cluster, source);
      }
    }

    for (const question of parsed.questions) {
      const key = normalizeLabel(question);
      if (!key) continue;
      const cluster = getOrCreate(questions, key);
      bumpLabel(cluster, question);
      noteEvidence(cluster, question);
      addSource(cluster, source);
    }
  }

  let inquiryCount = 0;
  for (const session of input.sessions) {
    const inquiry = session.seedQuestion?.trim() ?? "";
    if (!inquiry || looksEmpty(inquiry)) continue;
    inquiryCount += 1;
    const key = normalizeLabel(inquiry);
    const cluster = getOrCreate(questions, key);
    bumpLabel(cluster, inquiry);
    noteEvidence(cluster, inquiry);
    addSource(cluster, sessionSource(session));
  }

  addGraphEvidence({
    graph: input.graph,
    docsById,
    topics,
    differences,
  });

  const graph = input.graph;
  const closenessById = graph
    ? harmonicClosenessById(graph.nodes, graph.edges)
    : new Map<string, number>();
  const closenessByLabel = graph
    ? closenessByNormalizedLabel(graph.nodes, closenessById, normalizeLabel)
    : new Map<string, number>();

  return {
    topics: toItems(topics, closenessByLabel),
    differences: toItems(differences, closenessByLabel),
    questions: toItems(questions, closenessByLabel),
    documentCount: input.documents.length,
    inquiryCount,
  };
}

/** Tags we write ourselves — not real topics. */
const META_TAGS = new Set(["session-summary", "session summary"]);

function uniqueLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeLabel(value);
    if (!key || seen.has(key) || looksEmpty(value)) continue;
    if (META_TAGS.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function addGraphEvidence(input: {
  graph?: Top10GraphInput | null;
  docsById: Map<string, Top10DocumentInput>;
  topics: Map<string, Cluster>;
  differences: Map<string, Cluster>;
}): void {
  const graph = input.graph;
  if (!graph) return;

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const node of graph.nodes) {
    if (node.type !== "Theme" && node.type !== "Concept") continue;
    const key = normalizeLabel(node.label);
    if (!key) continue;
    const source = sourceFromGraphDoc(node.sourceDocumentId, input.docsById);
    if (!source) continue;
    const cluster = getOrCreate(input.topics, key);
    bumpLabel(cluster, node.label);
    if (!cluster.detail && node.description) {
      cluster.detail = displayLabel(node.description);
    }
    addSource(cluster, source);
  }

  for (const edge of graph.edges) {
    if (!edge.relationship || !CONTRAST_RELATIONSHIP.test(edge.relationship)) {
      continue;
    }
    const from = nodesById.get(edge.sourceNodeId);
    const to = nodesById.get(edge.targetNodeId);
    if (!from || !to) continue;
    const key = polarityKey(from.label, to.label);
    const source = sourceFromGraphDoc(edge.sourceDocumentId, input.docsById);
    if (!source) continue;
    const cluster = getOrCreate(input.differences, key);
    bumpLabel(cluster, `${from.label} ↔ ${to.label}`);
    if (!cluster.detail) {
      cluster.detail = displayLabel(edge.relationship);
    }
    addSource(cluster, source);
  }
}

function sourceFromGraphDoc(
  documentId: string | null,
  docsById: Map<string, Top10DocumentInput>,
): Top10Source | null {
  if (!documentId) return null;
  const doc = docsById.get(documentId);
  if (!doc) return null;
  return documentSource(doc);
}
