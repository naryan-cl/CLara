import { KnowledgeMap } from "@/components/KnowledgeMap";
import { listGraph } from "@/lib/graph/list-graph";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function MapPage() {
  const { stream } = await getActiveStream();
  const { nodes, edges, error } = stream
    ? await listGraph(stream.id)
    : { nodes: [], edges: [], error: null };

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
          <p className="text-sm text-ink/60">
            Nothing on the map yet — it fills in automatically as Public
            documents are added to the Commons.
          </p>
        </div>
      ) : (
        <div className="h-[min(70vh,640px)] min-h-[320px]">
          <KnowledgeMap nodes={nodes} edges={edges} />
        </div>
      )}
    </div>
  );
}
