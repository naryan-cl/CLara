import { createClient } from "@/lib/supabase/server";
import type {
  CommentEditLogEntry,
  CommentTargetType,
  CommonsComment,
  UserPublicProfile,
} from "@/lib/comments/types";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listStreamPeers } from "@/lib/streams/list-stream-peers";
import {
  avatarUrlFromMetadata,
  displayNameFromParts,
} from "@/lib/users/display-name";

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

function mapRpcProfile(row: {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}): UserPublicProfile {
  const fromRpc = (row.display_name ?? "").trim();
  return {
    user_id: row.user_id,
    email: row.email,
    display_name:
      fromRpc ||
      displayNameFromParts({
        email: row.email,
      }),
    avatar_url: row.avatar_url,
  };
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
    console.error("get_user_public_profiles:", error);
  }

  const profiles: UserPublicProfile[] = (data ?? []).map(
    (row: {
      user_id: string;
      email: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }) => mapRpcProfile(row),
  );

  const have = new Set(profiles.map((profile) => profile.user_id));
  const missing = unique.filter((id) => !have.has(id));

  if (missing.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && missing.includes(user.id)) {
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      profiles.push({
        user_id: user.id,
        email: user.email ?? null,
        display_name: displayNameFromParts({
          email: user.email,
          metadata,
        }),
        avatar_url: avatarUrlFromMetadata(metadata),
      });
    }
  }

  const stillMissing = unique.filter(
    (id) => !profiles.some((profile) => profile.user_id === id),
  );
  if (stillMissing.length > 0) {
    const { stream } = await getActiveStream();
    if (stream) {
      const { peers } = await listStreamPeers(stream.id);
      const missingSet = new Set(stillMissing);
      for (const peer of peers) {
        if (!missingSet.has(peer.user_id)) continue;
        if (profiles.some((profile) => profile.user_id === peer.user_id)) {
          continue;
        }
        profiles.push({
          user_id: peer.user_id,
          email: peer.email,
          display_name:
            (peer.display_name ?? "").trim() ||
            displayNameFromParts({ email: peer.email }),
          avatar_url: null,
        });
      }
    }
  }

  return {
    profiles,
    error: error && profiles.length === 0 ? error.message : null,
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
