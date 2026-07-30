import { createClient } from "@/lib/supabase/server";
import type {
  CommonsDocument,
  DocumentPrivacy,
  OkfDocumentType,
} from "@/lib/documents/types";

export type CreateDocumentInput = {
  streamId: string;
  createdBy: string;
  content: string;
  title?: string | null;
  type?: OkfDocumentType | null;
  sessionId?: string | null;
  privacyStatus?: DocumentPrivacy;
  tags?: string[];
  needsReview?: boolean;
};

/**
 * Insert one Commons document. Caller must pass a stream the user belongs to;
 * RLS still enforces membership on insert.
 */
export async function createDocument(
  input: CreateDocumentInput,
): Promise<{ document: CommonsDocument | null; error: string | null }> {
  const supabase = await createClient();

  const title = input.title?.trim() || null;
  const type = input.type?.trim() || null;
  const needsReview =
    input.needsReview ?? (!title || !type);

  const { data, error } = await supabase
    .from("documents")
    .insert({
      stream_id: input.streamId,
      created_by: input.createdBy,
      content: input.content,
      title,
      type,
      session_id: input.sessionId ?? null,
      privacy_status: input.privacyStatus ?? "public",
      tags: input.tags ?? [],
      participants: [],
      needs_review: needsReview,
    })
    .select(
      "id, stream_id, created_by, content, title, session_id, type, participants, tags, privacy_status, needs_review, created_at, updated_at",
    )
    .single();

  if (error) {
    return { document: null, error: error.message };
  }

  return { document: data as CommonsDocument, error: null };
}
