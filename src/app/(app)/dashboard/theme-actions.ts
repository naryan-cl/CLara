"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import {
  getThemeUnlockState,
  markThemeUnlockSeen,
  setMemberSelectedTheme,
} from "@/lib/map-theme/theme-state";
import { isMapThemeId } from "@/lib/map-theme/unlocks";
import type { MapThemeId } from "@/lib/map-theme/types";

export type ThemeActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireMember(): Promise<
  | { ok: true; streamId: string; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }
  const { stream } = await getActiveStream();
  if (!stream) {
    return { ok: false, error: "No active stream." };
  }
  return { ok: true, streamId: stream.id, userId: user.id };
}

/** Pick an unlocked dashboard map theme for the current member. */
export async function selectMapTheme(
  theme: MapThemeId,
): Promise<ThemeActionResult> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  if (!isMapThemeId(theme)) {
    return { ok: false, error: "Unknown theme." };
  }

  const { state, error } = await getThemeUnlockState(
    auth.streamId,
    auth.userId,
  );
  if (error || !state) {
    return { ok: false, error: error ?? "Could not load theme state." };
  }
  if (!state.unlocked.includes(theme)) {
    return { ok: false, error: "That theme is still locked." };
  }

  const { error: updateError } = await setMemberSelectedTheme(
    auth.streamId,
    auth.userId,
    theme,
  );
  if (updateError) {
    return { ok: false, error: updateError };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Acknowledge an unlock popup. Optionally apply the new theme immediately.
 */
export async function acknowledgeThemeUnlock(
  theme: "ocean" | "desert",
  applyNow: boolean,
): Promise<ThemeActionResult> {
  const auth = await requireMember();
  if (!auth.ok) return auth;

  const { state, error } = await getThemeUnlockState(
    auth.streamId,
    auth.userId,
  );
  if (error || !state) {
    return { ok: false, error: error ?? "Could not load theme state." };
  }
  if (!state.unlocked.includes(theme)) {
    return { ok: false, error: "That theme is still locked." };
  }

  const { error: seenError } = await markThemeUnlockSeen(
    auth.streamId,
    auth.userId,
    theme,
    applyNow,
  );
  if (seenError) {
    return { ok: false, error: seenError };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
