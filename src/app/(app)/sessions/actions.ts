"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { inngest, CLARA_DOCUMENT_CREATED } from "@/lib/inngest/client";

const ALLOWED_EXTENSIONS = new Set([".md", ".txt"]);
const MAX_BYTES = 512 * 1024; // 512 KB — keep first Receives slice simple
const MAX_PASTE_CHARS = 100_000;

export type ReceiveResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

/**
 * CLara Receives (text path): file upload XOR pasted text → Commons document
 * for the active stream.
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
        error: "Drop/select a .md/.txt file, or paste text.",
      };
    }

    if (source === "file" && !hasFile) {
      return { ok: false, error: "Choose a .md or .txt file to upload." };
    }

    if (source === "paste" && !hasPaste) {
      return { ok: false, error: "Paste some text before receiving." };
    }

    let content = "";
    let defaultTitle = "Untitled note";

    if (hasFile && file instanceof File) {
      if (file.size > MAX_BYTES) {
        return {
          ok: false,
          error: "File is too large for this first upload path (max 512 KB).",
        };
      }

      const name = file.name.toLowerCase();
      const extension = name.slice(name.lastIndexOf("."));
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return {
          ok: false,
          error: "Only .md and .txt uploads are supported so far.",
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

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content,
      title,
      type: typeFromForm,
      privacyStatus: "public",
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Receive failed." };
    }

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

/** @deprecated Use receiveTextContent — kept so old imports don't break mid-deploy. */
export async function receiveTextFile(
  formData: FormData,
): Promise<ReceiveResult> {
  return receiveTextContent(formData);
}
