import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type {
  CommonsDocument,
  DocumentPrivacy,
  OkfDocumentType,
} from "@/lib/documents/types";

export type UpdateDocumentInput = {
  id: string;
  title?: string | null;
  type?: OkfDocumentType | null;
  content?: string;
  privacyStatus?: DocumentPrivacy;
  sessionId?: string | null;
  needsReview?: boolean;
};

export async function updateDocument(
  input: UpdateDocumentInput,
): Promise<{ document: CommonsDocument | null; error: string | null }> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    patch.title = input.title?.trim() || null;
  }
  if (input.type !== undefined) {
    patch.type = input.type?.trim() || null;
  }
  if (input.content !== undefined) {
    patch.content = input.content;
    // Clear so the summarize job rewrites it and the UI shows Summarizing…
    patch.summary = null;
  }
  if (input.privacyStatus !== undefined) {
    patch.privacy_status = input.privacyStatus;
  }
  if (input.sessionId !== undefined) {
    patch.session_id = input.sessionId?.trim() || null;
  }
  if (input.needsReview !== undefined) {
    patch.needs_review = input.needsReview;
  } else if (input.title !== undefined || input.type !== undefined) {
    const title =
      input.title !== undefined ? input.title?.trim() || null : undefined;
    const type =
      input.type !== undefined ? input.type?.trim() || null : undefined;
    if (title !== undefined || type !== undefined) {
      // Recompute only when we know both after fetch would be better;
      // for this thin update, set needs_review if either cleared.
      if (title === null || type === null) {
        patch.needs_review = true;
      }
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", input.id)
    .select(
      DOCUMENT_SELECT,
    )
    .maybeSingle();

  if (error) {
    return { document: null, error: error.message };
  }

  if (!data) {
    return {
      document: null,
      error: "Document not found, or you don't have permission to edit it.",
    };
  }

  return { document: data as CommonsDocument, error: null };
}
