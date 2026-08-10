import { KnowledgeMap } from "@/components/KnowledgeMap";
import { getStreamMapLayoutConfig } from "@/lib/graph/get-map-layout-config";
import { listGraph } from "@/lib/graph/list-graph";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function MapPage() {
  const { stream } = await getActiveStream();
  const { nodes, edges, error } = stream
    ? await listGraph(stream.id)
    : { nodes: [], edges: [], error: null };
  const { config: layoutConfig } = stream
    ? await getStreamMapLayoutConfig(stream.id)
    : { config: undefined };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Knowledge Map
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Atoms, Concepts, Frameworks, and Themes drawn automatically from the{" "}
          {stream?.name ?? "Camp CLAI"} Commons. Click a node for details and
          a link back to where it came from.
        </p>
      </div>

      {!stream ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to see its Knowledge Map.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="font-mono text-sm text-danger">{error}</p>
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Nothing on the Knowledge Map yet.
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">
            This page shows <strong>concepts extracted</strong> from Public
            Commons documents (Atoms, Concepts, Frameworks, Themes) — not the
            same as the dashboard map, which plots Commons items themselves.
            After a Public document is submitted, the{" "}
            <span className="font-mono text-xs">clara-extract-graph</span> job
            (Inngest + OpenAI) fills this graph. Private docs and Reflect
            drafts never appear here.
          </p>
          <p className="mt-3 text-sm text-ink/55">
            If the dashboard already has items but this stays empty, check that
            Inngest is running in production and that Public documents have
            finished extraction.
          </p>
        </div>
      ) : (
        <div className="h-[min(70vh,640px)] min-h-[320px]">
          <KnowledgeMap
            nodes={nodes}
            edges={edges}
            layoutConfig={layoutConfig}
          />
        </div>
      )}
    </div>
  );
}
