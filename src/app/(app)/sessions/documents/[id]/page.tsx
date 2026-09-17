import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/CommentThread";
import { DocumentEditor } from "@/components/DocumentEditor";
import { loadCommonsDetail } from "@/app/(app)/commons/actions";
import { getAccessContext } from "@/lib/access/get-access-context";
import { resolveGuestParticipantProfiles } from "@/lib/access/link-guest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDocumentById } from "@/lib/documents/get-document";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listSessions } from "@/lib/sessions/list-sessions";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function loadLinkGuestDocument(
  id: string,
  allowedSessionIds: string[],
): Promise<{ document: CommonsDocument | null; error: string | null }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) return { document: null, error: error.message };
    const document = (data as CommonsDocument | null) ?? null;
    if (!document) return { document: null, error: null };
    if (
      !document.session_id ||
      !allowedSessionIds.includes(document.session_id)
    ) {
      return {
        document: null,
        error: "You can only open documents from the session you joined.",
      };
    }
    return { document, error: null };
  } catch (err) {
    return {
      document: null,
      error: err instanceof Error ? err.message : "Could not load document.",
    };
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params;
  const access = await getAccessContext();

  if (access.kind === "link_guest") {
    const { document, error } = await loadLinkGuestDocument(
      id,
      access.guestSessions.map((s) => s.id),
    );
    if (error) {
      return (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="font-mono text-sm text-danger">{error}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm text-horizon hover:underline"
          >
            ← Back to your sessions
          </Link>
        </div>
      );
    }
    if (!document) notFound();

    let createdByName: string | null = access.displayName;
    if (document.guest_participant_id) {
      const names = await resolveGuestParticipantProfiles([
        document.guest_participant_id,
      ]);
      createdByName =
        names.get(document.guest_participant_id) ?? createdByName;
    }

    return (
      <div className="flex flex-col gap-8">
        <Link
          href={
            document.session_id
              ? `/sessions/archive/${document.session_id}`
              : "/dashboard"
          }
          className="text-sm text-horizon hover:underline"
        >
          ← Back to session
        </Link>
        <DocumentEditor
          document={document}
          sessions={access.guestSessions}
          canEdit={
            Boolean(document.guest_participant_id) &&
            document.guest_participant_id === access.linkParticipantId
          }
          createdByName={createdByName}
          attendeeNames={[]}
          relateTargets={[]}
          relatedSessionIds={[]}
          relatedDocumentIds={[]}
        />
      </div>
    );
  }

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
