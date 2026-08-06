import { listCommonsItems } from "@/lib/commons/list-items";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { ExploreCommonsPanel } from "@/components/dashboard/ExploreCommonsPanel";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";

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

  return (
    <section className="grid min-h-[calc(100vh-9.5rem)] flex-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
      {stream && user ? (
        <ExploreCommonsPanel
          items={items}
          streamId={stream.id}
          currentUserId={user.id}
          error={commonsError}
        />
      ) : (
        <div className="flex h-full items-start rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to explore its Commons and add contributions.
          </p>
        </div>
      )}
      <AskClaraPanel />
    </section>
  );
}
