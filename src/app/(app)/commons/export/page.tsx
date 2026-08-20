import { PersonalExportPanel } from "@/components/commons/PersonalExportPanel";
import { listPersonalExportCatalog } from "@/lib/commons/list-personal-export-catalog";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalExportPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Join a stream to export your harvest.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { items, error } = await listPersonalExportCatalog(stream.id, user.id);

  if (error) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="font-mono text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <PersonalExportPanel
      streamName={stream.name}
      streamSlug={stream.slug}
      items={items}
      currentUserId={user.id}
    />
  );
}
