"use server";

import { revalidatePath } from "next/cache";
import { deleteDocument } from "@/lib/documents/delete-document";
import { updateDocument } from "@/lib/documents/update-document";
import { getDocumentById } from "@/lib/documents/get-document";
import { createSession } from "@/lib/sessions/create-session";
import { createClient } from "@/lib/supabase/server";
import { enqueueDocumentCreated } from "@/lib/embeddings/enqueue-document-created";
import { parseIdListFromFormData } from "@/lib/documents/parse-session-ids";
import { setDocumentLinks } from "@/lib/documents/set-document-links";
import type { DocumentPrivacy } from "@/lib/documents/types";

const NEW_SESSION_VALUE = "__new__";

export type SaveDocumentResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteDocumentResult =
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
    const isExternalRaw = String(formData.get("isExternal") ?? "")
      .trim()
      .toLowerCase();
    const isExternal =
      isExternalRaw === "on" ||
      isExternalRaw === "true" ||
      isExternalRaw === "1";
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

    const { document, error, contentChanged } = await updateDocument({
      id,
      title: title || null,
      type: type || null,
      content,
      sessionId: sessionId || null,
      privacyStatus,
      needsReview,
      isExternal,
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Save failed." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const links = await setDocumentLinks({
        streamId: document.stream_id,
        sourceDocumentId: document.id,
        createdBy: user.id,
        targetDocumentIds: parseIdListFromFormData(
          formData,
          "relatedDocumentIds",
        ),
        targetSessionIds: parseIdListFromFormData(
          formData,
          "relatedSessionIds",
        ),
      });
      if (links.error) {
        return { ok: false, error: links.error };
      }
    }

    // Re-index Ask / OKF / summary only when the Markdown body changed.
    // Metadata (External, privacy, nest) must not spend another LLM pass.
    if (contentChanged && document.content?.trim()) {
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

export async function deleteDocumentAction(
  documentId: string,
): Promise<DeleteDocumentResult> {
  try {
    const id = documentId.trim();
    if (!id) {
      return { ok: false, error: "Missing document id." };
    }

    const { error } = await deleteDocument(id);
    if (error) {
      return { ok: false, error };
    }

    revalidatePath("/sessions");
    revalidatePath("/commons");
    revalidatePath("/dashboard");
    revalidatePath("/admin");
    revalidatePath("/map");
    revalidatePath("/ask");
    revalidatePath(`/sessions/documents/${id}`);

    return { ok: true };
  } catch (err) {
    console.error("deleteDocumentAction failed:", err);
    return { ok: false, error: "Something went wrong while deleting." };
  }
}
