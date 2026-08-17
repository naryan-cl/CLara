import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type {
  CommonsDocument,
  DocumentPrivacy,
  OkfDocumentType,
} from "@/lib/documents/types";
import {
  parseListensJobMeta,
  stripListensJobMeta,
  withListensJobMeta,
} from "@/lib/listens/job-meta";

function comparableDocumentBody(value: string): string {
  return stripListensJobMeta(value).replace(/\r\n/g, "\n").trimEnd();
}

export type UpdateDocumentInput = {
  id: string;
  title?: string | null;
  type?: OkfDocumentType | null;
  content?: string;
  privacyStatus?: DocumentPrivacy;
  sessionId?: string | null;
  needsReview?: boolean;
  isExternal?: boolean;
};

export type UpdateDocumentResult = {
  document: CommonsDocument | null;
  error: string | null;
  /** True only when the Markdown body changed — callers use this to skip re-summarize. */
  contentChanged: boolean;
};

export async function updateDocument(
  input: UpdateDocumentInput,
): Promise<UpdateDocumentResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  let contentChanged = false;
  if (input.title !== undefined) {
    patch.title = input.title?.trim() || null;
  }
  if (input.type !== undefined) {
    patch.type = input.type?.trim() || null;
  }
  if (input.content !== undefined) {
    let nextContent = input.content;
    const { data: existing } = await supabase
      .from("documents")
      .select("content")
      .eq("id", input.id)
      .maybeSingle();
    const existingContent =
      existing?.content != null ? String(existing.content) : "";
    const meta = existingContent
      ? parseListensJobMeta(existingContent)
      : null;
    if (meta) {
      nextContent = withListensJobMeta(nextContent, meta);
    }
    // Compare the visible body so a metadata-only save (External, privacy,
    // nest) does not look like a rewrite and burn a summarize call.
    const existingBody = comparableDocumentBody(existingContent);
    const nextBody = comparableDocumentBody(nextContent);
    if (existingBody !== nextBody) {
      patch.content = nextContent;
      patch.summary = null;
      contentChanged = true;
    }
  }
  if (input.privacyStatus !== undefined) {
    patch.privacy_status = input.privacyStatus;
  }
  if (input.sessionId !== undefined) {
    patch.session_id = input.sessionId?.trim() || null;
  }
  if (input.isExternal !== undefined) {
    patch.is_external = input.isExternal;
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
    return { document: null, error: error.message, contentChanged: false };
  }

  if (!data) {
    return {
      document: null,
      error: "Document not found, or you don't have permission to edit it.",
      contentChanged: false,
    };
  }

  return { document: data as CommonsDocument, error: null, contentChanged };
}
