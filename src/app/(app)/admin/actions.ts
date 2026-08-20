"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { addStreamMemberByEmail } from "@/lib/streams/add-member";
import { removeStreamMember } from "@/lib/streams/remove-member";
import { updateMemberRole } from "@/lib/streams/update-member-role";
import { updateStreamIsolation } from "@/lib/streams/update-isolation";
import { updateStreamPrompt } from "@/lib/prompts/update-stream-prompt";
import { isPromptKind, type PromptKind } from "@/lib/prompts/defaults";
import { updateStreamThemeSettings } from "@/lib/map-theme/theme-state";
import { isMapThemeId, type MapThemeId } from "@/lib/map-theme";
import { listDocumentsMissingEmbeddings } from "@/lib/embeddings/list-missing-embeddings";
import { enqueueDocumentCreated } from "@/lib/embeddings/enqueue-document-created";
import {
  parseMapLayoutConfig,
  type MapLayoutConfig,
  type MapLayoutSurface,
} from "@/lib/graph/map-layout-config";
import {
  getStreamMapLayouts,
  updateStreamMapLayouts,
} from "@/lib/graph/get-map-layout-config";
import {
  resetStreamAskLlmSettings as resetAskLlmSettings,
  saveStreamAskLlmSettings as persistAskLlmSettings,
  type SaveAskLlmInput,
} from "@/lib/ask/update-stream-ask-llm-settings";
import { isAskLlmProvider } from "@/lib/ask/llm-types";
import { restoreTrashItem } from "@/lib/trash/restore";
import type { TrashKind } from "@/lib/trash/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type RestoreTrashActionResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

export type BackfillResult =
  | { ok: true; queued: number }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; streamId: string; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream || stream.role !== "admin") {
    return { ok: false, error: "Not authorized." };
  }

  return { ok: true, streamId: stream.id, userId: user.id };
}

export async function addMember(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { ok: false, error: "Enter an email address." };
  }

  const { error } = await addStreamMemberByEmail(auth.streamId, email);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (userId === auth.userId) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const { error } = await removeStreamMember(auth.streamId, userId);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function changeMemberRole(
  userId: string,
  role: "admin" | "member",
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (userId === auth.userId) {
    return { ok: false, error: "You can't change your own role." };
  }

  const { error } = await updateMemberRole(auth.streamId, userId, role);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleIsolation(enabled: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { error } = await updateStreamIsolation(auth.streamId, enabled);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Save a Reflect, Ask, or Summarize system-prompt override for the active stream. */
export async function saveStreamPrompt(
  kind: PromptKind,
  value: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!isPromptKind(kind)) {
    return { ok: false, error: "Unknown prompt kind." };
  }

  const { error } = await updateStreamPrompt(auth.streamId, kind, value);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Clear override so the product default is used again. */
export async function resetStreamPrompt(
  kind: PromptKind,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!isPromptKind(kind)) {
    return { ok: false, error: "Unknown prompt kind." };
  }

  const { error } = await updateStreamPrompt(auth.streamId, kind, null);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Admin: stream default map theme + Ocean/Desert unlock thresholds. */
export async function saveMapThemeSettings(input: {
  defaultMapTheme: MapThemeId;
  oceanUnlockAt: number;
  desertUnlockAt: number;
}): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!isMapThemeId(input.defaultMapTheme)) {
    return { ok: false, error: "Unknown default theme." };
  }
  if (
    !Number.isFinite(input.oceanUnlockAt) ||
    input.oceanUnlockAt < 0 ||
    !Number.isInteger(input.oceanUnlockAt) ||
    !Number.isFinite(input.desertUnlockAt) ||
    input.desertUnlockAt < 0 ||
    !Number.isInteger(input.desertUnlockAt)
  ) {
    return { ok: false, error: "Thresholds must be whole numbers ≥ 0." };
  }

  const { error } = await updateStreamThemeSettings(auth.streamId, {
    defaultMapTheme: input.defaultMapTheme,
    oceanUnlockAt: input.oceanUnlockAt,
    desertUnlockAt: input.desertUnlockAt,
  });
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Enqueue clara/document.created for every non-draft doc that has content
 * but zero Ask embedding chunks. Inngest clara-embed-document does the work.
 */
export async function backfillMissingEmbeddings(): Promise<BackfillResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { documents, error } = await listDocumentsMissingEmbeddings(
    auth.streamId,
  );
  if (error) {
    return { ok: false, error };
  }

  for (const doc of documents) {
    await enqueueDocumentCreated(doc.documentId, auth.streamId);
  }

  revalidatePath("/admin");
  return { ok: true, queued: documents.length };
}

/** Persist physics + size knobs for one surface (Knowledge Map or Dashboard). */
export async function saveMapLayoutConfig(
  surface: MapLayoutSurface,
  raw: MapLayoutConfig,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { layouts, error: loadError } = await getStreamMapLayouts(auth.streamId);
  if (loadError) {
    return { ok: false, error: loadError };
  }

  const next = {
    ...layouts,
    [surface]: parseMapLayoutConfig(raw),
  };
  const { error } = await updateStreamMapLayouts(auth.streamId, next);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/map-layout");
  revalidatePath("/dashboard");
  revalidatePath("/map");
  return { ok: true };
}

/** Save Ask CLara answer-model provider + optional encrypted API key. */
export async function saveStreamAskLlmSettings(
  input: SaveAskLlmInput,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!isAskLlmProvider(input.provider)) {
    return { ok: false, error: "Unknown provider." };
  }

  const { error } = await persistAskLlmSettings(auth.streamId, input);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  revalidatePath("/ask");
  return { ok: true };
}

/** Revert Ask CLara to platform OPENAI_* env for answers. */
export async function resetStreamAskLlmSettings(): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { error } = await resetAskLlmSettings(auth.streamId);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  revalidatePath("/ask");
  return { ok: true };
}

/** Undo a Commons Delete — item leaves Trash and is live again. */
export async function restoreTrashItemAction(
  kind: TrashKind,
  id: string,
): Promise<RestoreTrashActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (kind !== "document" && kind !== "session") {
    return { ok: false, error: "Unknown trash item." };
  }

  const result = await restoreTrashItem(auth.streamId, kind, id);
  if (!result.ok) return result;

  revalidatePath("/admin");
  revalidatePath("/commons");
  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  revalidatePath("/map");
  revalidatePath("/ask");
  revalidatePath("/top10");
  if (kind === "document") {
    revalidatePath(`/sessions/documents/${id}`);
  } else {
    revalidatePath(`/sessions/archive/${id}`);
  }

  return result;
}

/** Reset one surface to product defaults (the other tab is unchanged). */
export async function resetMapLayoutConfig(
  surface: MapLayoutSurface,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { layouts, error: loadError } = await getStreamMapLayouts(auth.streamId);
  if (loadError) {
    return { ok: false, error: loadError };
  }

  const next = {
    ...layouts,
    [surface]: parseMapLayoutConfig(null),
  };
  const { error } = await updateStreamMapLayouts(auth.streamId, next);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/map-layout");
  revalidatePath("/dashboard");
  revalidatePath("/map");
  return { ok: true };
}
