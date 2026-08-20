"use server";

import { revalidatePath } from "next/cache";
import { updateSession } from "@/lib/sessions/update-session";
import { setSessionRelations } from "@/lib/sessions/set-session-relations";
import { setSessionDocumentLinks } from "@/lib/sessions/set-session-document-links";
import { parseIdListFromFormData } from "@/lib/documents/parse-session-ids";
import { parseHighlightColor } from "@/lib/sessions/highlight";
import { createClient } from "@/lib/supabase/server";
import {
  deleteSession,
  type DeleteSessionMode,
} from "@/lib/sessions/delete-session";
import type { SessionSummary } from "@/lib/sessions/types";

export type SaveSessionResult =
  | { ok: true; session: SessionSummary }
  | { ok: false; error: string };

export async function saveSessionEdits(
  formData: FormData,
): Promise<SaveSessionResult> {
  try {
    const sessionId = String(formData.get("id") ?? "").trim();
    if (!sessionId) {
      return { ok: false, error: "Missing session id." };
    }

    const result = await updateSession({
      sessionId,
      name: String(formData.get("name") ?? ""),
      occurredAt: String(formData.get("occurredAt") ?? ""),
      seedQuestion: String(formData.get("seedQuestion") ?? ""),
      description: String(formData.get("description") ?? ""),
      highlightColor: parseHighlightColor(formData.get("highlightColor")),
    });

    if (!result.ok) return result;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const relatedSessionIds = parseIdListFromFormData(
        formData,
        "relatedSessionIds",
      );
      const relatedDocumentIds = parseIdListFromFormData(
        formData,
        "relatedDocumentIds",
      );
      const relations = await setSessionRelations(
        sessionId,
        relatedSessionIds,
      );
      if (relations.error) {
        return { ok: false, error: relations.error };
      }
      const docLinks = await setSessionDocumentLinks({
        streamId: result.session.stream_id,
        sessionId,
        createdBy: user.id,
        documentIds: relatedDocumentIds,
      });
      if (docLinks.error) {
        return { ok: false, error: docLinks.error };
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/commons");
    revalidatePath("/sessions");
    revalidatePath(`/sessions/archive/${sessionId}`);

    return result;
  } catch (err) {
    console.error("saveSessionEdits failed:", err);
    return { ok: false, error: "Something went wrong while saving." };
  }
}

export type DeleteSessionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteSessionAction(
  sessionId: string,
  mode: DeleteSessionMode,
): Promise<DeleteSessionResult> {
  try {
    const id = sessionId.trim();
    if (!id) {
      return { ok: false, error: "Missing session id." };
    }
    if (mode !== "ungroup" && mode !== "delete-nested") {
      return { ok: false, error: "Choose whether to keep or delete nested documents." };
    }

    const result = await deleteSession(id, mode);
    if (!result.ok) return result;

    revalidatePath("/dashboard");
    revalidatePath("/commons");
    revalidatePath("/sessions");
    revalidatePath("/admin");
    revalidatePath("/map");
    revalidatePath(`/sessions/archive/${id}`);

    return { ok: true };
  } catch (err) {
    console.error("deleteSessionAction failed:", err);
    return { ok: false, error: "Something went wrong while deleting." };
  }
}
