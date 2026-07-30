"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";

const ALLOWED_EXTENSIONS = new Set([".md", ".txt"]);
const MAX_BYTES = 512 * 1024; // 512 KB — keep first Receives slice simple

export type ReceiveResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

/**
 * CLara Receives (text path): read an uploaded .md/.txt and save to Commons
 * for the active stream.
 */
export async function receiveTextFile(
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

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Choose a .md or .txt file to upload." };
    }

    if (file.size <= 0) {
      return { ok: false, error: "That file is empty." };
    }

    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        error: "File is too large for this first upload path (max 512 KB).",
      };
    }

    const name = file.name.toLowerCase();
    const extension = name.slice(name.lastIndexOf("."));
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return { ok: false, error: "Only .md and .txt uploads are supported so far." };
    }

    const content = await file.text();
    if (!content.trim()) {
      return { ok: false, error: "That file has no text content." };
    }

    const titleFromForm = String(formData.get("title") ?? "").trim();
    const typeFromForm = String(formData.get("type") ?? "").trim() || "Note";
    const title =
      titleFromForm ||
      file.name.replace(/\.(md|txt)$/i, "").replace(/[-_]+/g, " ").trim() ||
      "Untitled upload";

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content,
      title,
      type: typeFromForm,
      privacyStatus: "public",
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Upload failed." };
    }

    return {
      ok: true,
      documentId: document.id,
      needsReview: document.needs_review,
    };
  } catch (err) {
    console.error("receiveTextFile failed:", err);
    return {
      ok: false,
      error: "Something went wrong while receiving the file. Try again.",
    };
  }
}
