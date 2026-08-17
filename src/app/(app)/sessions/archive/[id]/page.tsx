import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceToggle } from "@/components/AttendanceToggle";
import { CommentThread } from "@/components/CommentThread";
import { SessionSummaryTabs } from "@/components/commons/ElementReadView";
import { SessionEditor } from "@/components/SessionEditor";
import { loadCommonsDetail } from "@/app/(app)/commons/actions";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getSessionById } from "@/lib/sessions/get-session";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { isAttending } from "@/lib/sessions/attendance";

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
          href="/commons"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Commons
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
          href="/commons"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Commons
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

  const { detail } = user
    ? await loadCommonsDetail("session", id)
    : { detail: null };
  const comments = detail?.kind === "session" ? detail.comments : [];
  const isAdmin = detail?.kind === "session" ? detail.isAdmin : false;
  const canEdit = detail?.kind === "session" ? detail.canEdit : false;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/commons" className="text-sm text-horizon hover:underline">
        ← Back to Commons
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SessionEditor
            session={session}
            nestedDocuments={documents}
            canEdit={canEdit}
          />
        </div>
        {user ? (
          <AttendanceToggle
            sessionId={session.id}
            initialAttending={attending}
          />
        ) : null}
      </div>

      {detail?.kind === "session" && detail.createdBy?.display_name ? (
        <section className="flex flex-col gap-1">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Created by
          </h2>
          <p className="text-sm text-ink/80">{detail.createdBy.display_name}</p>
        </section>
      ) : null}

      {detail?.kind === "session" && detail.attendees.length >= 2 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Attendees
          </h2>
          <ul className="flex flex-wrap gap-2">
            {detail.attendees.map((person) => (
              <li
                key={person.user_id}
                className="rounded-pill border border-cloud bg-sand/50 px-3 py-1 text-xs text-ink/80"
              >
                {person.display_name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        {detail?.kind === "session" ? (
          <SessionSummaryTabs detail={detail} />
        ) : documents.length === 0 ? (
          <p className="text-sm text-ink/60">
            No Commons documents are tied to this session yet.
          </p>
        ) : (
          <p className="text-sm text-ink/60">
            Sign in to read the session summary and contributions.
          </p>
        )}
      </section>

      {user ? (
        <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <CommentThread
            targetType="session"
            targetId={session.id}
            initialComments={comments}
            currentUserId={user.id}
            isAdmin={isAdmin}
          />
        </section>
      ) : null}
    </div>
  );
}
