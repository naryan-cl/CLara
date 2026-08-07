import { listCommonsItems } from "@/lib/commons/list-items";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { stream } = await getActiveStream();
  const { items, error: commonsError } =
    stream && user
      ? await listCommonsItems(stream.id, user.id)
      : { items: [], error: null };

  if (!stream || !user) {
    return (
      <section className="grid min-h-[calc(100vh-9.5rem)] flex-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
        <div className="flex h-full items-start rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to explore its Commons and add contributions.
          </p>
        </div>
        <div className="rounded-lg border border-horizon/30 bg-paper p-6 shadow-soft ring-1 ring-horizon/15">
          <p className="text-sm text-ink/60">Ask CLara needs an active stream.</p>
        </div>
      </section>
    );
  }

  return (
    <DashboardGrid
      items={items}
      streamId={stream.id}
      currentUserId={user.id}
      error={commonsError}
    />
  );
}
