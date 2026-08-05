import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listGraph } from "@/lib/graph/list-graph";
import { ExploreCommonsPanel } from "@/components/dashboard/ExploreCommonsPanel";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";

export default async function DashboardPage() {
  const { stream } = await getActiveStream();
  const {
    nodes,
    edges,
    error: graphError,
  } = stream
    ? await listGraph(stream.id)
    : { nodes: [], edges: [], error: null };

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
      {stream ? (
        <ExploreCommonsPanel nodes={nodes} edges={edges} error={graphError} />
      ) : (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to explore its Knowledge Map and add to the
            Commons.
          </p>
        </div>
      )}
      <AskClaraPanel />
    </section>
  );
}
