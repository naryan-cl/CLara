import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentList } from "@/components/DocumentList";
import { AttendanceToggle } from "@/components/AttendanceToggle";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getSessionById } from "@/lib/sessions/get-session";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { isAttending } from "@/lib/sessions/attendance";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SessionArchiveDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { stream } = await getActiveStream();
  const { session, error } = await getSessionById(id);

  if (error) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="font-mono text-sm text-danger">{error}</p>
        <Link
          href="/sessions/archive"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Session archive
        </Link>
      </div>
    );
  }

  if (!session) {
    notFound();
  }

  // Soft guard: prefer sessions in the active stream (RLS is the real boundary).
  if (stream && session.stream_id !== stream.id) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          This session belongs to another stream than your active one.
        </p>
        <Link
          href="/sessions/archive"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Session archive
        </Link>
      </div>
    );
  }

  const { documents } = await listDocumentsBySession(session.id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { attending } = user
    ? await isAttending(session.id, user.id)
    : { attending: false };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/sessions/archive"
        className="text-sm text-horizon hover:underline"
      >
        ← Back to Session archive
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            {session.name}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-ink/40">
            {session.occurred_at
              ? new Date(session.occurred_at).toLocaleDateString()
              : `Created ${new Date(session.created_at).toLocaleDateString()}`}
          </p>
        </div>
        {user ? (
          <AttendanceToggle sessionId={session.id} initialAttending={attending} />
        ) : null}
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        {documents.length === 0 ? (
          <p className="text-sm text-ink/60">
            No Commons documents are tied to this session yet.
          </p>
        ) : (
          <DocumentList documents={documents} />
        )}
      </section>
    </div>
  );
}
