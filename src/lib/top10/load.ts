import { createClient } from "@/lib/supabase/server";
import { listGraph } from "@/lib/graph/list-graph";
import { listSessions } from "@/lib/sessions/list-sessions";
import type {
  Top10DocumentInput,
  Top10GraphInput,
  Top10SessionInput,
} from "./types";

const MAX_DOCUMENTS = 500;

type DocumentRow = {
  id: string;
  title: string | null;
  type: string | null;
  tags: unknown;
  summary: string | null;
  created_at: string;
};

/**
 * Load stream-scoped Public Commons evidence for Top 10.
 * Request-scoped client (RLS). We still filter to public + non-draft in
 * the query so a member's private reflections never appear on the board —
 * same privacy posture as the Knowledge Map.
 */
export async function loadTop10Inputs(streamId: string): Promise<{
  documents: Top10DocumentInput[];
  sessions: Top10SessionInput[];
  graph: Top10GraphInput;
  error: string | null;
}> {
  const supabase = await createClient();

  const [docsResult, sessionsResult, graphResult] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, type, tags, summary, created_at")
      .eq("stream_id", streamId)
      .eq("privacy_status", "public")
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(MAX_DOCUMENTS),
    listSessions(streamId),
    listGraph(streamId),
  ]);

  if (docsResult.error) {
    return {
      documents: [],
      sessions: [],
      graph: { nodes: [], edges: [] },
      error: docsResult.error.message,
    };
  }
  if (sessionsResult.error) {
    return {
      documents: [],
      sessions: [],
      graph: { nodes: [], edges: [] },
      error: sessionsResult.error,
    };
  }
  if (graphResult.error) {
    return {
      documents: [],
      sessions: [],
      graph: { nodes: [], edges: [] },
      error: graphResult.error,
    };
  }

  const documents: Top10DocumentInput[] = (
    (docsResult.data ?? []) as DocumentRow[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    tags: row.tags,
    summary: row.summary,
    createdAt: row.created_at,
  }));

  const sessions: Top10SessionInput[] = sessionsResult.sessions.map(
    (session) => ({
      id: session.id,
      name: session.name,
      seedQuestion: session.seed_question,
    }),
  );

  const graph: Top10GraphInput = {
    nodes: graphResult.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      description: node.description,
      sourceDocumentId: node.sourceDocumentId,
    })),
    edges: graphResult.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationship: edge.relationship,
      sourceDocumentId: edge.sourceDocumentId,
    })),
  };

  return { documents, sessions, graph, error: null };
}
