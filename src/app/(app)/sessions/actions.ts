"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { setDocumentLinks } from "@/lib/documents/set-document-links";
import { parseSessionIdsFromFormData, parseIdListFromFormData } from "@/lib/documents/parse-session-ids";
import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  CLARA_UPLOAD_RECEIVED,
} from "@/lib/inngest/client";
import type { StreamSummary } from "@/lib/streams/types";

function isExternalFromForm(formData: FormData): boolean {
  const raw = String(formData.get("isExternal") ?? "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1";
}

const TEXT_EXTENSIONS = new Set([".md", ".txt"]);
const CONVERTIBLE_EXTENSIONS = new Set([".pdf", ".docx"]);
/** Guard: audio must not POST through this action (browser staging instead). */
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".webm",
  ".ogg",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".flac",
]);
const MAX_BYTES = 512 * 1024; // 512 KB — keep first Receives slice simple
const MAX_CONVERTIBLE_BYTES = 4.5 * 1024 * 1024; // stay under the 5mb server action body limit
const MAX_PASTE_CHARS = 100_000;
const ALLOWED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...CONVERTIBLE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export type ReceiveResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

async function persistRelateLinks(
  formData: FormData,
  streamId: string,
  documentId: string,
  userId: string,
) {
  await setDocumentLinks({
    streamId,
    sourceDocumentId: documentId,
    createdBy: userId,
    targetDocumentIds: parseIdListFromFormData(formData, "relatedDocumentIds"),
    targetSessionIds: parseIdListFromFormData(formData, "relatedSessionIds"),
  });
}

/**
 * CLara Receives: file upload XOR pasted text → Commons document
 * for the active stream. Audio files upload in the browser (Listens
 * staging + Inngest), not this Server Action.
 */
export async function receiveTextContent(
  formData: FormData,
): Promise<ReceiveResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in to upload." };
    }

    const { stream } = await getActiveStream();
    if (!stream) {
      return {
        ok: false,
        error: "No active stream. Ask an admin to add you to Camp CLAI.",
      };
    }

    const source = String(formData.get("source") ?? "").trim();
    const file = formData.get("file");
    const pasted = String(formData.get("pastedText") ?? "");

    const hasFile = file instanceof File && file.size > 0;
    const hasPaste = pasted.trim().length > 0;

    if (hasFile && hasPaste) {
      return {
        ok: false,
        error: "Use either a file or pasted text — not both.",
      };
    }

    if (!hasFile && !hasPaste) {
      return {
        ok: false,
        error: "Drop/select a file, or paste text.",
      };
    }

    if (source === "file" && !hasFile) {
      return { ok: false, error: "Choose a file to upload." };
    }

    if (source === "paste" && !hasPaste) {
      return { ok: false, error: "Paste some text before receiving." };
    }

    let content = "";
    let defaultTitle = "Untitled note";

    if (hasFile && file instanceof File) {
      const name = file.name.toLowerCase();
      const extension = name.slice(name.lastIndexOf("."));

      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return {
          ok: false,
          error:
            "Only .md, .txt, .pdf, .docx, and audio uploads are supported.",
        };
      }

      if (AUDIO_EXTENSIONS.has(extension)) {
        return {
          ok: false,
          error:
            "Audio files now upload in the browser (same path as Record). Refresh this page and try again.",
        };
      }

      if (CONVERTIBLE_EXTENSIONS.has(extension)) {
        return receiveConvertibleUpload({
          file,
          extension: extension as ".pdf" | ".docx",
          formData,
          user,
          stream,
        });
      }

      if (file.size > MAX_BYTES) {
        return {
          ok: false,
          error: "File is too large for this first upload path (max 512 KB).",
        };
      }

      content = await file.text();
      defaultTitle =
        file.name.replace(/\.(md|txt)$/i, "").replace(/[-_]+/g, " ").trim() ||
        "Untitled upload";
    } else {
      if (pasted.length > MAX_PASTE_CHARS) {
        return {
          ok: false,
          error: "Pasted text is too long for this first path.",
        };
      }
      content = pasted;
      defaultTitle = "Pasted note";
    }

    if (!content.trim()) {
      return { ok: false, error: "That content is empty." };
    }

    const titleFromForm = String(formData.get("title") ?? "").trim();
    const typeFromForm = String(formData.get("type") ?? "").trim() || "Note";
    const title = titleFromForm || defaultTitle;
    const sessionIds = parseSessionIdsFromFormData(formData);
    const primarySessionId = sessionIds[0] ?? null;

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content,
      title,
      type: typeFromForm,
      privacyStatus: "public",
      sessionId: primarySessionId,
      isExternal: isExternalFromForm(formData),
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Receive failed." };
    }

    const linkError = await linkDocumentSessions(document.id, sessionIds);
    if (linkError.error) {
      return { ok: false, error: linkError.error };
    }

    await persistRelateLinks(formData, stream.id, document.id, user.id);

    try {
      await inngest.send({
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId: document.id, streamId: stream.id },
      });
    } catch (err) {
      // OKF enrichment is best-effort — never fail the user's Receive over it.
      console.error("Failed to enqueue OKF enrichment:", err);
    }

    return {
      ok: true,
      documentId: document.id,
      needsReview: document.needs_review,
    };
  } catch (err) {
    console.error("receiveTextContent failed:", err);
    return {
      ok: false,
      error: "Something went wrong while receiving. Try again.",
    };
  }
}

/**
 * CLara Receives (PDF/DOCX path): stage the raw file in Storage, create a
 * placeholder document, and hand off Markdown extraction to Inngest — heavy
 * conversion work shouldn't block the request. Rolls back on enqueue failure
 * since, unlike OKF enrichment, extracted content IS the point of this path.
 */
async function receiveConvertibleUpload({
  file,
  extension,
  formData,
  user,
  stream,
}: {
  file: File;
  extension: ".pdf" | ".docx";
  formData: FormData;
  user: { id: string };
  stream: StreamSummary;
}): Promise<ReceiveResult> {
  if (file.size > MAX_CONVERTIBLE_BYTES) {
    return {
      ok: false,
      error: "File is too large for this upload path (max ~4.5 MB).",
    };
  }

  const supabase = await createClient();
  const storagePath = `${stream.id}/${crypto.randomUUID()}${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("receives-staging")
    .upload(storagePath, file, {
      contentType: file.type || undefined,
    });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const titleFromForm = String(formData.get("title") ?? "").trim();
  const typeFromForm = String(formData.get("type") ?? "").trim() || "Note";
  const defaultTitle =
    file.name.replace(/\.(pdf|docx)$/i, "").replace(/[-_]+/g, " ").trim() ||
    "Untitled upload";
  const sessionIds = parseSessionIdsFromFormData(formData);
  const primarySessionId = sessionIds[0] ?? null;

  const { document, error } = await createDocument({
    streamId: stream.id,
    createdBy: user.id,
    content: "",
    title: titleFromForm || defaultTitle,
    type: typeFromForm,
    privacyStatus: "public",
    needsReview: true, // pending conversion
    sessionId: primarySessionId,
    isExternal: isExternalFromForm(formData),
  });

  if (error || !document) {
    await supabase.storage.from("receives-staging").remove([storagePath]);
    return { ok: false, error: error ?? "Receive failed." };
  }

  const linkError = await linkDocumentSessions(document.id, sessionIds);
  if (linkError.error) {
    await supabase.storage.from("receives-staging").remove([storagePath]);
    await supabase.from("documents").delete().eq("id", document.id);
    return { ok: false, error: linkError.error };
  }

  await persistRelateLinks(formData, stream.id, document.id, user.id);

  try {
    await inngest.send({
      name: CLARA_UPLOAD_RECEIVED,
      data: {
        documentId: document.id,
        streamId: stream.id,
        storagePath,
        fileType: extension === ".pdf" ? "pdf" : "docx",
      },
    });
  } catch (err) {
    console.error("Failed to enqueue upload conversion:", err);
    await supabase.storage.from("receives-staging").remove([storagePath]);
    await supabase.from("documents").delete().eq("id", document.id);
    return {
      ok: false,
      error: "Couldn't start processing this file. Try again.",
    };
  }

  return { ok: true, documentId: document.id, needsReview: true };
}

/** @deprecated Use receiveTextContent — kept so old imports don't break mid-deploy. */
export async function receiveTextFile(
  formData: FormData,
): Promise<ReceiveResult> {
  return receiveTextContent(formData);
}
