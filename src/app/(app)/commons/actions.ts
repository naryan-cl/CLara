"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import {
  createComment,
  deleteComment,
  getUserPublicProfiles,
  listCommentEditLog,
  listComments,
  updateComment,
} from "@/lib/comments";
import type {
  CommentEditLogEntry,
  CommentTargetType,
  CommonsComment,
  UserPublicProfile,
} from "@/lib/comments/types";
import { getDocumentById } from "@/lib/documents/get-document";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { needsElementSummary } from "@/lib/documents/summary";
import { enqueueDocumentSummarize } from "@/lib/embeddings/enqueue-document-created";
import { getSessionById } from "@/lib/sessions/get-session";
import { canEditSession } from "@/lib/sessions/can-edit-session";
import { isAttending } from "@/lib/sessions/attendance";
import { listSessionAttendeeProfiles } from "@/lib/sessions/list-attendees";
import { listSessions } from "@/lib/sessions/list-sessions";
import { listRelateTargets, type RelateTarget } from "@/lib/commons/relate-targets";
import {
  listDocumentsLinkedToSession,
  listLinksForDocument,
} from "@/lib/documents/list-document-links";
import { listRelatedSessionIds } from "@/lib/sessions/list-session-relations";
import type { CommonsDocument } from "@/lib/documents/types";
import type { SessionSummary } from "@/lib/sessions/types";
import {
  recordingProcessStatus,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";

export type CommentWithAuthor = CommonsComment & {
  author: UserPublicProfile;
};

export type DocumentDetailPayload = {
  kind: "document";
  document: CommonsDocument;
  sessions: SessionSummary[];
  canEdit: boolean;
  comments: CommentWithAuthor[];
  isAdmin: boolean;
  createdBy: UserPublicProfile | null;
  attendees: UserPublicProfile[];
  relateTargets: RelateTarget[];
  relatedSessionIds: string[];
  relatedDocumentIds: string[];
};

export type SessionDetailPayload = {
  kind: "session";
  session: SessionSummary;
  documents: CommonsDocument[];
  attending: boolean;
  canEdit: boolean;
  comments: CommentWithAuthor[];
  isAdmin: boolean;
  createdBy: UserPublicProfile | null;
  attendees: UserPublicProfile[];
  relateTargets: RelateTarget[];
  relatedSessionIds: string[];
  relatedDocumentIds: string[];
};

export type DetailPayload = DocumentDetailPayload | SessionDetailPayload;

async function attachAuthors(
  comments: CommonsComment[],
): Promise<CommentWithAuthor[]> {
  const { profiles } = await getUserPublicProfiles(
    comments.map((c) => c.author_id),
  );
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return comments.map((c) => ({
    ...c,
    author: byId.get(c.author_id) ?? {
      user_id: c.author_id,
      email: null,
      display_name: "Member",
      avatar_url: null,
    },
  }));
}

const SUMMARY_BACKFILL_AFTER_MS = 90_000;

function maybeBackfillSummary(doc: CommonsDocument) {
  if (!needsElementSummary(doc)) return;
  const updatedAt = new Date(doc.updated_at).getTime();
  const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
  if (ageMs < SUMMARY_BACKFILL_AFTER_MS) return;
  void enqueueDocumentSummarize(doc.id, doc.stream_id);
}

async function resolveCreatedBy(
  userId: string | null,
): Promise<UserPublicProfile | null> {
  if (!userId) return null;
  const { profiles } = await getUserPublicProfiles([userId]);
  return (
    profiles[0] ?? {
      user_id: userId,
      email: null,
      display_name: "Member",
      avatar_url: null,
    }
  );
}

export async function loadCommonsDetail(
  kind: CommentTargetType,
  id: string,
): Promise<{ detail: DetailPayload | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { detail: null, error: "Sign in required." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return { detail: null, error: "No active stream." };
  }

  const isAdmin = stream.role === "admin";

  if (kind === "document") {
    const { document, error } = await getDocumentById(id);
    if (error) return { detail: null, error };
    if (!document || document.stream_id !== stream.id) {
      return { detail: null, error: "Document not found." };
    }

    const [
      { sessions },
      commentsResult,
      attendingResult,
      createdBy,
      attendeesResult,
      relateTargets,
      linksResult,
    ] = await Promise.all([
      listSessions(stream.id),
      listComments(stream.id, "document", id),
      document.session_id
        ? isAttending(document.session_id, user.id)
        : Promise.resolve({ attending: false, error: null }),
      resolveCreatedBy(document.created_by),
      document.session_id
        ? listSessionAttendeeProfiles(document.session_id)
        : Promise.resolve({ attendees: [] as UserPublicProfile[], error: null }),
      listRelateTargets(stream.id),
      listLinksForDocument(id),
    ]);

    const canEdit =
      document.created_by === user.id ||
      isAdmin ||
      attendingResult.attending === true;

    maybeBackfillSummary(document);

    return {
      detail: {
        kind: "document",
        document,
        sessions,
        canEdit,
        comments: await attachAuthors(commentsResult.comments),
        isAdmin,
        createdBy,
        attendees: attendeesResult.attendees,
        relateTargets,
        relatedSessionIds: linksResult.relatedSessionIds,
        relatedDocumentIds: linksResult.relatedDocumentIds,
      },
      error: null,
    };
  }

  const { session, error } = await getSessionById(id);
  if (error) return { detail: null, error };
  if (!session || session.stream_id !== stream.id) {
    return { detail: null, error: "Session not found." };
  }

  const [
    { documents },
    attendingResult,
    commentsResult,
    createdBy,
    attendeesResult,
    relateTargets,
    relatedSessionsResult,
    linkedDocsResult,
  ] = await Promise.all([
    listDocumentsBySession(id),
    isAttending(id, user.id),
    listComments(stream.id, "session", id),
    resolveCreatedBy(session.created_by),
    listSessionAttendeeProfiles(id),
    listRelateTargets(stream.id),
    listRelatedSessionIds(id),
    listDocumentsLinkedToSession(id),
  ]);

  const canEdit = canEditSession({
    userId: user.id,
    createdBy: session.created_by,
    isAdmin,
    attending: attendingResult.attending === true,
    nestedAuthorIds: documents.map((doc) => doc.created_by),
  });

  return {
    detail: {
      kind: "session",
      session,
      documents: documents,
      attending: attendingResult.attending,
      canEdit,
      comments: await attachAuthors(commentsResult.comments),
      isAdmin,
      createdBy,
      attendees: attendeesResult.attendees,
      relateTargets,
      relatedSessionIds: relatedSessionsResult.ids,
      relatedDocumentIds: linkedDocsResult.ids,
    },
    error: null,
  };
}

export async function postComment(input: {
  targetType: CommentTargetType;
  targetId: string;
  body: string;
}): Promise<{ ok: true; comment: CommentWithAuthor } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { stream } = await getActiveStream();
  if (!stream) return { ok: false, error: "No active stream." };

  const { comment, error } = await createComment({
    streamId: stream.id,
    targetType: input.targetType,
    targetId: input.targetId,
    authorId: user.id,
    body: input.body,
  });
  if (error || !comment) return { ok: false, error: error ?? "Failed to post." };

  const withAuthor = (await attachAuthors([comment]))[0];
  revalidatePath("/commons");
  return { ok: true, comment: withAuthor };
}

export async function editComment(input: {
  commentId: string;
  body: string;
  previousBody: string;
}): Promise<{ ok: true; comment: CommentWithAuthor } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { stream } = await getActiveStream();
  if (!stream) return { ok: false, error: "No active stream." };

  const { comment, error } = await updateComment({
    commentId: input.commentId,
    authorId: user.id,
    streamId: stream.id,
    body: input.body,
    previousBody: input.previousBody,
  });
  if (error || !comment) return { ok: false, error: error ?? "Failed to edit." };

  const withAuthor = (await attachAuthors([comment]))[0];
  revalidatePath("/commons");
  return { ok: true, comment: withAuthor };
}

export async function removeComment(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { error } = await deleteComment(commentId, user.id);
  if (error) return { ok: false, error };
  revalidatePath("/commons");
  return { ok: true };
}

export async function loadCommentAuditLog(
  commentId: string,
): Promise<
  | { ok: true; entries: (CommentEditLogEntry & { editor_name: string })[] }
  | { ok: false; error: string }
> {
  const { stream } = await getActiveStream();
  if (!stream || stream.role !== "admin") {
    return { ok: false, error: "Admins only." };
  }

  const { entries, error } = await listCommentEditLog(stream.id, commentId);
  if (error) return { ok: false, error };

  const { profiles } = await getUserPublicProfiles(entries.map((e) => e.editor_id));
  const byId = new Map(profiles.map((p) => [p.user_id, p.display_name]));

  return {
    ok: true,
    entries: entries.map((e) => ({
      ...e,
      editor_name: byId.get(e.editor_id) ?? "Member",
    })),
  };
}

/**
 * Lightweight poll for Listens pipeline status on the dashboard.
 * Why: after Record submit we keep the selected item live while Whisper/OKF run,
 * without reloading the full Commons detail payload every few seconds.
 */
export async function pollDocumentProcessStatus(
  documentId: string,
): Promise<
  | {
      ok: true;
      document: CommonsDocument;
      processStatus: RecordingProcessStatus;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { stream } = await getActiveStream();
  if (!stream) return { ok: false, error: "No active stream." };

  const { document, error } = await getDocumentById(documentId);
  if (error) return { ok: false, error };
  if (!document || document.stream_id !== stream.id) {
    return { ok: false, error: "Document not found." };
  }

  return {
    ok: true,
    document,
    processStatus: recordingProcessStatus(document),
  };
}
