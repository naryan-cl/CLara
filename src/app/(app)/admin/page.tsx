import { DocumentList } from "@/components/DocumentList";
import { MembersPanel } from "@/components/MembersPanel";
import { IsolationToggle } from "@/components/IsolationToggle";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listNeedsReviewDocuments } from "@/lib/documents/list-needs-review";
import { listStreamMembers } from "@/lib/streams/list-members";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          No active stream — join a stream to see its Admin Queue.
        </p>
      </div>
    );
  }

  if (stream.role !== "admin") {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Admin Queue is only visible to admins of {stream.name}.
        </p>
      </div>
    );
  }

  const { documents, error } = await listNeedsReviewDocuments(stream.id);
  const { members, error: membersError } = await listStreamMembers(stream.id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Membership, isolation, and the metadata review queue for{" "}
          {stream.name}.
        </p>
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Isolation
        </h2>
        <div className="mt-4">
          <IsolationToggle initialEnabled={stream.isolation_enabled} />
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Membership
        </h2>
        {membersError ? (
          <p className="mt-3 font-mono text-sm text-danger">
            {membersError}
          </p>
        ) : (
          <div className="mt-4">
            <MembersPanel members={members} currentUserId={user?.id ?? ""} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Admin Queue
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Documents the OKF enrichment pass couldn&apos;t confidently fill in.
          Open one, fix Title / Type (and Tags / Participants / Session ID if
          needed), and save — that clears it from this queue.
        </p>
        <div className="mt-4">
          {error ? (
            <p className="font-mono text-sm text-danger">{error}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-ink/60">
              Nothing flagged right now — every document in {stream.name} has
              enough metadata.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
                {documents.length} flagged
              </p>
              <DocumentList documents={documents} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
