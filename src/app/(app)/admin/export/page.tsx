import { CommonsExportPanel } from "@/components/admin/CommonsExportPanel";
import { listExportCatalog } from "@/lib/commons/list-export-catalog";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createClient } from "@/lib/supabase/server";

export default async function AdminExportPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          No active stream — join a stream to export Commons content.
        </p>
      </div>
    );
  }

  if (stream.role !== "admin") {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Export is only available to admins of {stream.name}.
        </p>
      </div>
    );
  }

  const { items, error } = await listExportCatalog(stream.id);

  if (error) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="font-mono text-sm text-danger">{error}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CommonsExportPanel
      streamName={stream.name}
      streamSlug={stream.slug}
      items={items}
      currentUserId={user?.id ?? ""}
    />
  );
}
