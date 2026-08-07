import { createClient } from "@/lib/supabase/server";
import type { MapThemeId } from "@/lib/map-theme/types";
import {
  DEFAULT_DESERT_UNLOCK_AT,
  DEFAULT_OCEAN_UNLOCK_AT,
  clampThemeToUnlocked,
  parseMapThemeId,
  pendingUnlockPopupFor,
  unlockedThemesFor,
  type MemberThemePrefs,
  type StreamThemeSettings,
  type ThemeUnlockState,
} from "@/lib/map-theme/unlocks";

function settingsFromRow(row: {
  default_map_theme?: string | null;
  ocean_unlock_at?: number | null;
  desert_unlock_at?: number | null;
}): StreamThemeSettings {
  return {
    defaultMapTheme: parseMapThemeId(row.default_map_theme, "plant"),
    oceanUnlockAt:
      typeof row.ocean_unlock_at === "number"
        ? row.ocean_unlock_at
        : DEFAULT_OCEAN_UNLOCK_AT,
    desertUnlockAt:
      typeof row.desert_unlock_at === "number"
        ? row.desert_unlock_at
        : DEFAULT_DESERT_UNLOCK_AT,
  };
}

function prefsFromRow(row: {
  selected_map_theme?: string | null;
  ocean_unlock_seen_at?: string | null;
  desert_unlock_seen_at?: string | null;
} | null): MemberThemePrefs {
  return {
    selectedMapTheme: parseMapThemeId(row?.selected_map_theme, "plant"),
    oceanUnlockSeenAt: row?.ocean_unlock_seen_at ?? null,
    desertUnlockSeenAt: row?.desert_unlock_seen_at ?? null,
  };
}

/** Count Public non-draft documents this member authored in the stream. */
export async function countThemeContributions(
  streamId: string,
  userId: string,
): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("stream_id", streamId)
    .eq("created_by", userId)
    .eq("privacy_status", "public")
    .eq("is_draft", false);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

export async function getStreamThemeSettings(
  streamId: string,
): Promise<{ settings: StreamThemeSettings | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streams")
    .select("default_map_theme, ocean_unlock_at, desert_unlock_at")
    .eq("id", streamId)
    .maybeSingle();

  if (error) {
    return { settings: null, error: error.message };
  }
  if (!data) {
    return { settings: null, error: "Stream not found." };
  }
  return { settings: settingsFromRow(data), error: null };
}

export async function updateStreamThemeSettings(
  streamId: string,
  input: {
    defaultMapTheme: MapThemeId;
    oceanUnlockAt: number;
    desertUnlockAt: number;
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("streams")
    .update({
      default_map_theme: input.defaultMapTheme,
      ocean_unlock_at: input.oceanUnlockAt,
      desert_unlock_at: input.desertUnlockAt,
    })
    .eq("id", streamId);

  return { error: error?.message ?? null };
}

export async function getMemberThemePrefs(
  streamId: string,
  userId: string,
): Promise<{ prefs: MemberThemePrefs | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stream_members")
    .select(
      "selected_map_theme, ocean_unlock_seen_at, desert_unlock_seen_at",
    )
    .eq("stream_id", streamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { prefs: null, error: error.message };
  }
  return { prefs: prefsFromRow(data), error: null };
}

export async function setMemberSelectedTheme(
  streamId: string,
  userId: string,
  theme: MapThemeId,
): Promise<{ error: string | null }> {
  void userId; // auth.uid() inside SECURITY DEFINER RPC
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_map_theme", {
    p_stream_id: streamId,
    p_theme: theme,
  });

  return { error: error?.message ?? null };
}

export async function markThemeUnlockSeen(
  streamId: string,
  userId: string,
  theme: "ocean" | "desert",
  applyNow = false,
): Promise<{ error: string | null }> {
  void userId;
  const supabase = await createClient();
  const { error } = await supabase.rpc("ack_map_theme_unlock", {
    p_stream_id: streamId,
    p_theme: theme,
    p_apply: applyNow,
  });

  return { error: error?.message ?? null };
}

/**
 * Full unlock snapshot for the dashboard: count, unlocked set, active theme,
 * and whether to show the congratulations popup.
 */
export async function getThemeUnlockState(
  streamId: string,
  userId: string,
): Promise<{ state: ThemeUnlockState | null; error: string | null }> {
  const [settingsRes, prefsRes, countRes] = await Promise.all([
    getStreamThemeSettings(streamId),
    getMemberThemePrefs(streamId, userId),
    countThemeContributions(streamId, userId),
  ]);

  if (settingsRes.error || !settingsRes.settings) {
    return {
      state: null,
      error: settingsRes.error ?? "Missing theme settings.",
    };
  }
  if (prefsRes.error || !prefsRes.prefs) {
    return {
      state: null,
      error: prefsRes.error ?? "Missing theme prefs.",
    };
  }
  if (countRes.error) {
    return { state: null, error: countRes.error };
  }

  const settings = settingsRes.settings;
  const prefs = prefsRes.prefs;
  const unlocked = unlockedThemesFor(countRes.count, settings);
  const activeTheme = clampThemeToUnlocked(
    prefs.selectedMapTheme,
    unlocked,
    settings.defaultMapTheme,
  );
  const pendingUnlockPopup = pendingUnlockPopupFor(unlocked, prefs);

  return {
    state: {
      contributionCount: countRes.count,
      unlocked,
      activeTheme,
      pendingUnlockPopup,
      settings,
      prefs,
    },
    error: null,
  };
}
