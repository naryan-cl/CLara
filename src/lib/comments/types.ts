export type CommentTargetType = "document" | "session";

export type CommonsComment = {
  id: string;
  stream_id: string;
  target_type: CommentTargetType;
  target_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

export type UserPublicProfile = {
  user_id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
};

export type CommentEditLogEntry = {
  id: string;
  comment_id: string;
  stream_id: string;
  editor_id: string;
  previous_body: string;
  edited_at: string;
};
