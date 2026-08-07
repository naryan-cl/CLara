export type {
  MapThemeId,
  MapThemePalette,
  TopoWashBlob,
  TopoWorld,
} from "./types";
export {
  DESERT_PALETTE,
  OCEAN_PALETTE,
  PLANT_PALETTE,
  paletteFor,
} from "./palettes";
export {
  clearTopoWorldCache,
  contourPathForLevel,
  generateTopoWorld,
  generateWashBlobs,
  paintElevationWash,
  paintSmoothTopo,
  quantizedViewport,
  sampleHeightField,
  worldBoundsForViewport,
} from "./generate-topo";
export { fbm2D, seedFromString, valueNoise2D } from "./noise";
export {
  DEFAULT_DESERT_UNLOCK_AT,
  DEFAULT_OCEAN_UNLOCK_AT,
  MAP_THEME_IDS,
  clampThemeToUnlocked,
  isMapThemeId,
  parseMapThemeId,
  pendingUnlockPopupFor,
  themeLabel,
  unlockedThemesFor,
  type MemberThemePrefs,
  type StreamThemeSettings,
  type ThemeUnlockState,
} from "./unlocks";

// Server-only helpers (cookies / Supabase): import from
// `@/lib/map-theme/theme-state` — do NOT re-export here or client
// components that import this barrel will pull in next/headers.
