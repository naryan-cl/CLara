"use server";

import { revalidatePath } from "next/cache";
import { updateSession } from "@/lib/sessions/update-session";
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
    });

    if (!result.ok) return result;

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
