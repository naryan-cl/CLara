import { createClient } from "@/lib/supabase/server";
import type {
  CommentEditLogEntry,
  CommentTargetType,
  CommonsComment,
  UserPublicProfile,
} from "@/lib/comments/types";

export async function listComments(
  streamId: string,
  targetType: CommentTargetType,
  targetId: string,
): Promise<{ comments: CommonsComment[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, stream_id, target_type, target_id, author_id, body, created_at, updated_at, edited_at",
    )
    .eq("stream_id", streamId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });

  if (error) {
    return { comments: [], error: error.message };
  }

  return { comments: (data ?? []) as CommonsComment[], error: null };
}

export async function createComment(input: {
  streamId: string;
  targetType: CommentTargetType;
  targetId: string;
  authorId: string;
  body: string;
}): Promise<{ comment: CommonsComment | null; error: string | null }> {
  const supabase = await createClient();
  const body = input.body.trim();
  if (!body) {
    return { comment: null, error: "Comment cannot be empty." };
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      stream_id: input.streamId,
      target_type: input.targetType,
      target_id: input.targetId,
      author_id: input.authorId,
      body,
    })
    .select(
      "id, stream_id, target_type, target_id, author_id, body, created_at, updated_at, edited_at",
    )
    .maybeSingle();

  if (error) {
    return { comment: null, error: error.message };
  }

  return { comment: data as CommonsComment, error: null };
}

export async function updateComment(input: {
  commentId: string;
  authorId: string;
  streamId: string;
  body: string;
  previousBody: string;
}): Promise<{ comment: CommonsComment | null; error: string | null }> {
  const supabase = await createClient();
  const body = input.body.trim();
  if (!body) {
    return { comment: null, error: "Comment cannot be empty." };
  }

  // Audit log first (admin-visible). Best-effort: if log insert fails, still try update.
  const { error: logError } = await supabase.from("comment_edit_log").insert({
    comment_id: input.commentId,
    stream_id: input.streamId,
    editor_id: input.authorId,
    previous_body: input.previousBody,
  });

  if (logError) {
    return { comment: null, error: logError.message };
  }

  const { data, error } = await supabase
    .from("comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", input.commentId)
    .eq("author_id", input.authorId)
    .select(
      "id, stream_id, target_type, target_id, author_id, body, created_at, updated_at, edited_at",
    )
    .maybeSingle();

  if (error) {
    return { comment: null, error: error.message };
  }
  if (!data) {
    return { comment: null, error: "Comment not found, or you can't edit it." };
  }

  return { comment: data as CommonsComment, error: null };
}

export async function deleteComment(
  commentId: string,
  authorId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", authorId);

  return { error: error?.message ?? null };
}

export async function getUserPublicProfiles(
  userIds: string[],
): Promise<{ profiles: UserPublicProfile[]; error: string | null }> {
  if (userIds.length === 0) {
    return { profiles: [], error: null };
  }

  const supabase = await createClient();
  const unique = [...new Set(userIds)];

  const { data, error } = await supabase.rpc("get_user_public_profiles", {
    p_user_ids: unique,
  });

  if (error) {
    return { profiles: [], error: error.message };
  }

  return {
    profiles: (data ?? []).map(
      (row: {
        user_id: string;
        email: string | null;
        display_name: string;
        avatar_url: string | null;
      }) => ({
        user_id: row.user_id,
        email: row.email,
        display_name: row.display_name || "Member",
        avatar_url: row.avatar_url,
      }),
    ),
    error: null,
  };
}

export async function listCommentEditLog(
  streamId: string,
  commentId: string,
): Promise<{ entries: CommentEditLogEntry[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comment_edit_log")
    .select("id, comment_id, stream_id, editor_id, previous_body, edited_at")
    .eq("stream_id", streamId)
    .eq("comment_id", commentId)
    .order("edited_at", { ascending: false });

  if (error) {
    return { entries: [], error: error.message };
  }

  return { entries: (data ?? []) as CommentEditLogEntry[], error: null };
}
