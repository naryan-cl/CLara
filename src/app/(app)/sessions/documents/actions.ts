"use server";

import { revalidatePath } from "next/cache";
import { updateDocument } from "@/lib/documents/update-document";
import type { DocumentPrivacy } from "@/lib/documents/types";

export type SaveDocumentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveDocumentEdits(
  formData: FormData,
): Promise<SaveDocumentResult> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return { ok: false, error: "Missing document id." };
    }

    const title = String(formData.get("title") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim();
    const content = String(formData.get("content") ?? "");
    const sessionId = String(formData.get("sessionId") ?? "").trim();
    const privacyRaw = String(formData.get("privacyStatus") ?? "public");
    const privacyStatus: DocumentPrivacy =
      privacyRaw === "private" ? "private" : "public";
    const needsReview = !title || !type;

    const { document, error } = await updateDocument({
      id,
      title: title || null,
      type: type || null,
      content,
      sessionId: sessionId || null,
      privacyStatus,
      needsReview,
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Save failed." };
    }

    revalidatePath("/sessions");
    revalidatePath("/dashboard");
    revalidatePath(`/sessions/documents/${id}`);

    return { ok: true };
  } catch (err) {
    console.error("saveDocumentEdits failed:", err);
    return { ok: false, error: "Something went wrong while saving." };
  }
}
