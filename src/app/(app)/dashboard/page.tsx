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
      <div className="fixed inset-x-0 bottom-0 top-[var(--clara-header-height)] flex items-center justify-center bg-forest-deep p-8">
        <div className="organic-ask max-w-md border border-cloud/80 bg-paper/95 p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to explore its Commons and add contributions.
          </p>
          <p className="mt-3 text-sm text-ink/55">
            Ask CLara needs an active stream.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardGrid
      items={items}
      streamId={stream.id}
      streamName={stream.name}
      currentUserId={user.id}
      error={commonsError}
    />
  );
}
