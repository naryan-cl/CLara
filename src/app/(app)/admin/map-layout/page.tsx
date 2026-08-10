import { MapLayoutAdminPanel } from "@/components/admin/MapLayoutAdminPanel";
import { getStreamMapLayoutConfig } from "@/lib/graph/get-map-layout-config";
import { listGraph } from "@/lib/graph/list-graph";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function AdminMapLayoutPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          No active stream — join a stream to tune its map layout.
        </p>
      </div>
    );
  }

  if (stream.role !== "admin") {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Map layout is only editable by admins of {stream.name}.
        </p>
      </div>
    );
  }

  const [{ config }, { nodes, edges }] = await Promise.all([
    getStreamMapLayoutConfig(stream.id),
    listGraph(stream.id),
  ]);

  return (
    <MapLayoutAdminPanel
      streamName={stream.name}
      initialConfig={config}
      previewNodes={nodes}
      previewEdges={edges}
    />
  );
}
