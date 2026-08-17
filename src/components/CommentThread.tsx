"use client";

import { useState, useTransition } from "react";
import {
  editComment,
  loadCommentAuditLog,
  postComment,
  removeComment,
  type CommentWithAuthor,
} from "@/app/(app)/commons/actions";
import type { CommentTargetType } from "@/lib/comments/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function AuthorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote auth avatars; no next/image domain config
      <img
        src={avatarUrl}
        alt=""
        className="h-7 w-7 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full bg-cloud font-mono text-[10px] text-ink/70"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function CommentThread({
  targetType,
  targetId,
  initialComments,
  currentUserId,
  isAdmin,
}: {
  targetType: CommentTargetType;
  targetId: string;
  initialComments: CommentWithAuthor[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const [auditLines, setAuditLines] = useState<string[]>([]);

  function onPost(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postComment({
        targetType,
        targetId,
        body: draft,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComments((prev) => [...prev, result.comment]);
      setDraft("");
    });
  }

  function onSaveEdit(comment: CommentWithAuthor) {
    setError(null);
    startTransition(async () => {
      const result = await editComment({
        commentId: comment.id,
        body: editDraft,
        previousBody: comment.body,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? result.comment : c)),
      );
      setEditingId(null);
    });
  }

  function onDelete(commentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeComment(commentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    });
  }

  function onShowAudit(commentId: string) {
    setAuditFor(commentId);
    setAuditLines(["Loading…"]);
    startTransition(async () => {
      const result = await loadCommentAuditLog(commentId);
      if (!result.ok) {
        setAuditLines([result.error]);
        return;
      }
      if (result.entries.length === 0) {
        setAuditLines(["No edits recorded."]);
        return;
      }
      setAuditLines(
        result.entries.map(
          (e) =>
            `${e.editor_name} · ${new Date(e.edited_at).toLocaleString()} — was: “${e.previous_body.slice(0, 120)}${e.previous_body.length > 120 ? "…" : ""}”`,
        ),
      );
    });
  }

  return (
    <section className="flex flex-col gap-4 border-t border-cloud pt-4">
      <h3 className="font-display text-lg font-medium text-ink">Comments</h3>

      {comments.length === 0 ? (
        <p className="text-sm text-ink/50">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const isAuthor = comment.author_id === currentUserId;
            return (
              <li key={comment.id} className="flex gap-3">
                <AuthorAvatar
                  name={comment.author.display_name}
                  avatarUrl={comment.author.avatar_url}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-ink">
                      {comment.author.display_name}
                    </span>
                    <time className="font-mono text-[11px] text-ink/40">
                      {new Date(comment.created_at).toLocaleString()}
                    </time>
                    {comment.edited_at ? (
                      <span className="font-mono text-[11px] text-ink/40">
                        · edited
                      </span>
                    ) : null}
                  </div>

                  {editingId === comment.id ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onSaveEdit(comment)}
                          className="min-h-11 rounded-md bg-forest px-3 py-2 text-sm font-medium text-paper disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="min-h-11 rounded-md border border-cloud px-3 py-2 text-sm text-ink/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">
                      {comment.body}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {isAuthor && editingId !== comment.id ? (
                      <>
                        <button
                          type="button"
                          className="min-h-11 px-2 text-sm text-horizon hover:underline"
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditDraft(comment.body);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="min-h-11 px-2 text-sm text-danger hover:underline"
                          disabled={pending}
                          onClick={() => onDelete(comment.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                    {isAdmin && comment.edited_at ? (
                      <button
                        type="button"
                        className="min-h-11 px-2 text-sm text-ink/50 hover:underline"
                        onClick={() => onShowAudit(comment.id)}
                      >
                        Audit log
                      </button>
                    ) : null}
                  </div>

                  {auditFor === comment.id ? (
                    <ul className="mt-2 rounded-md border border-cloud bg-sand p-2 font-mono text-[11px] text-ink/60">
                      {auditLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={onPost} className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink" htmlFor="comment-draft">
          Add a comment
        </label>
        <textarea
          id="comment-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Share a note…"
          className="w-full rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post comment"}
        </button>
      </form>

      {error ? <p className="font-mono text-xs text-danger">{error}</p> : null}
    </section>
  );
}
