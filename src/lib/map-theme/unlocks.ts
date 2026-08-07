import type { MapThemeId } from "@/lib/map-theme/types";

export const MAP_THEME_IDS: readonly MapThemeId[] = [
  "plant",
  "ocean",
  "desert",
] as const;

export const DEFAULT_OCEAN_UNLOCK_AT = 5;
export const DEFAULT_DESERT_UNLOCK_AT = 10;

export type StreamThemeSettings = {
  defaultMapTheme: MapThemeId;
  oceanUnlockAt: number;
  desertUnlockAt: number;
};

export type MemberThemePrefs = {
  selectedMapTheme: MapThemeId;
  oceanUnlockSeenAt: string | null;
  desertUnlockSeenAt: string | null;
};

export type ThemeUnlockState = {
  contributionCount: number;
  unlocked: MapThemeId[];
  /** Effective theme after clamping to unlocked + stream default. */
  activeTheme: MapThemeId;
  /** Themes newly unlocked that the member has not acknowledged yet. */
  pendingUnlockPopup: MapThemeId | null;
  settings: StreamThemeSettings;
  prefs: MemberThemePrefs;
};

export function isMapThemeId(value: unknown): value is MapThemeId {
  return value === "plant" || value === "ocean" || value === "desert";
}

export function parseMapThemeId(
  value: unknown,
  fallback: MapThemeId = "plant",
): MapThemeId {
  return isMapThemeId(value) ? value : fallback;
}

/**
 * Plant is always available. Ocean / Desert unlock by contribution thresholds.
 * Thresholds of 0 mean immediately available (admin can open everything).
 */
export function unlockedThemesFor(
  contributionCount: number,
  settings: StreamThemeSettings,
): MapThemeId[] {
  const unlocked: MapThemeId[] = ["plant"];
  if (contributionCount >= settings.oceanUnlockAt) {
    unlocked.push("ocean");
  }
  if (contributionCount >= settings.desertUnlockAt) {
    unlocked.push("desert");
  }
  return unlocked;
}

export function clampThemeToUnlocked(
  selected: MapThemeId,
  unlocked: MapThemeId[],
  streamDefault: MapThemeId,
): MapThemeId {
  if (unlocked.includes(selected)) return selected;
  if (unlocked.includes(streamDefault)) return streamDefault;
  return "plant";
}

/**
 * Prefer Desert over Ocean if both are newly unlocked and unseen,
 * so the higher reward is celebrated first.
 */
export function pendingUnlockPopupFor(
  unlocked: MapThemeId[],
  prefs: MemberThemePrefs,
): MapThemeId | null {
  if (
    unlocked.includes("desert") &&
    prefs.desertUnlockSeenAt == null
  ) {
    return "desert";
  }
  if (
    unlocked.includes("ocean") &&
    prefs.oceanUnlockSeenAt == null
  ) {
    return "ocean";
  }
  return null;
}

export function themeLabel(theme: MapThemeId): string {
  switch (theme) {
    case "plant":
      return "Plant";
    case "ocean":
      return "Ocean";
    case "desert":
      return "Desert";
  }
}
