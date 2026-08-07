"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { addStreamMemberByEmail } from "@/lib/streams/add-member";
import { removeStreamMember } from "@/lib/streams/remove-member";
import { updateMemberRole } from "@/lib/streams/update-member-role";
import { updateStreamIsolation } from "@/lib/streams/update-isolation";
import { updateStreamPrompt } from "@/lib/prompts/update-stream-prompt";
import type { PromptKind } from "@/lib/prompts/defaults";
import { updateStreamThemeSettings } from "@/lib/map-theme/theme-state";
import { isMapThemeId, type MapThemeId } from "@/lib/map-theme";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

/** Save a Reflect or Ask system-prompt override for the active stream. */
export async function saveStreamPrompt(
  kind: PromptKind,
  value: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (kind !== "reflect" && kind !== "ask") {
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

  if (kind !== "reflect" && kind !== "ask") {
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
