import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/CommentThread";
import { DocumentEditor } from "@/components/DocumentEditor";
import { loadCommonsDetail } from "@/app/(app)/commons/actions";
import { getDocumentById } from "@/lib/documents/get-document";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listSessions } from "@/lib/sessions/list-sessions";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params;
  const { stream } = await getActiveStream();
  const { document, error } = await getDocumentById(id);

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

  if (!document) {
    notFound();
  }

  const { sessions } = stream
    ? await listSessions(stream.id)
    : { sessions: [] };

  // Soft guard: prefer docs in the active stream (RLS is the real boundary).
  if (stream && document.stream_id !== stream.id) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          This document belongs to another stream than your active one.
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { detail } = user
    ? await loadCommonsDetail("document", id)
    : { detail: null };

  const canEdit =
    detail?.kind === "document"
      ? detail.canEdit
      : document.created_by === user?.id;
  const comments = detail?.kind === "document" ? detail.comments : [];
  const isAdmin = detail?.kind === "document" ? detail.isAdmin : false;

  return (
    <div className="flex flex-col gap-8">
      <Link href="/commons" className="text-sm text-horizon hover:underline">
        ← Back to Commons
      </Link>
      <DocumentEditor
        document={
          detail?.kind === "document" ? detail.document : document
        }
        sessions={
          detail?.kind === "document" ? detail.sessions : sessions
        }
        canEdit={canEdit}
        createdByName={
          detail?.kind === "document"
            ? (detail.createdBy?.display_name ?? null)
            : null
        }
        attendeeNames={
          detail?.kind === "document"
            ? detail.attendees.map((person) => person.display_name)
            : []
        }
        relateTargets={
          detail?.kind === "document" ? detail.relateTargets : []
        }
        relatedSessionIds={
          detail?.kind === "document" ? detail.relatedSessionIds : []
        }
        relatedDocumentIds={
          detail?.kind === "document" ? detail.relatedDocumentIds : []
        }
      />
      {user ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <CommentThread
            targetType="document"
            targetId={document.id}
            initialComments={comments}
            currentUserId={user.id}
            isAdmin={isAdmin}
          />
        </div>
      ) : null}
    </div>
  );
}
