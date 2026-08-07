"use server";

import { revalidatePath } from "next/cache";
import { updateDocument } from "@/lib/documents/update-document";
import { getDocumentById } from "@/lib/documents/get-document";
import { createSession } from "@/lib/sessions/create-session";
import { createClient } from "@/lib/supabase/server";
import { enqueueDocumentCreated } from "@/lib/embeddings/enqueue-document-created";
import type { DocumentPrivacy } from "@/lib/documents/types";

const NEW_SESSION_VALUE = "__new__";

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
    const sessionChoice = String(formData.get("sessionId") ?? "").trim();
    const newSessionName = String(formData.get("newSessionName") ?? "").trim();
    const privacyRaw = String(formData.get("privacyStatus") ?? "public");
    const privacyStatus: DocumentPrivacy =
      privacyRaw === "private" ? "private" : "public";
    const needsReview = !title || !type;

    let sessionId: string | null = sessionChoice || null;

    if (sessionChoice === NEW_SESSION_VALUE) {
      if (!newSessionName) {
        return { ok: false, error: "Enter a name for the new session." };
      }

      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { ok: false, error: "Not signed in." };
      }

      const { document: existingDoc, error: docError } =
        await getDocumentById(id);
      if (docError || !existingDoc) {
        return { ok: false, error: docError ?? "Document not found." };
      }

      const { session, error: sessionError } = await createSession({
        streamId: existingDoc.stream_id,
        createdBy: user.id,
        name: newSessionName,
      });
      if (sessionError || !session) {
        return { ok: false, error: sessionError ?? "Could not create session." };
      }

      sessionId = session.id;
    }

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

    // Re-index Ask (and refresh OKF / graph) when content is present.
    // Why: edits used to update documents.content only — Ask kept stale or
    // empty embeddings until a full re-create.
    if (document.content?.trim()) {
      await enqueueDocumentCreated(document.id, document.stream_id);
    }

    revalidatePath("/sessions");
    revalidatePath("/commons");
    revalidatePath("/dashboard");
    revalidatePath(`/sessions/documents/${id}`);

    return { ok: true };
  } catch (err) {
    console.error("saveDocumentEdits failed:", err);
    return { ok: false, error: "Something went wrong while saving." };
  }
}
