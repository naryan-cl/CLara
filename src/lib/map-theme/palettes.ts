import type { MapThemeId, MapThemePalette } from "./types";

/**
 * Plant — lighter green topo field (Module A).
 * Labels/edges use ink/forest so they stay readable on the wash.
 */
export const PLANT_PALETTE: MapThemePalette = {
  id: "plant",
  base: "#9BB89A",
  bands: ["#C8DCC4", "#B3CDB0", "#9BB89A", "#7FA087", "#648A6C", "#4F7358"],
  contour: "#2E4B45",
  contourOpacity: 0.28,
  labelFill: "#1C2A2E",
  edgeStroke: "#2E4B45",
  edgeOpacity: 0.5,
  nodeStroke: "rgba(28, 42, 46, 0.28)",
  pinnedStroke: "#1C2A2E",
};

/** Placeholders for Module B — same structure, blue / sand hues. */
export const OCEAN_PALETTE: MapThemePalette = {
  id: "ocean",
  base: "#7A9EB5",
  bands: ["#C5D9E6", "#A8C4D6", "#7A9EB5", "#5B849C", "#3E6E8E", "#2F5570"],
  contour: "#1C2A2E",
  contourOpacity: 0.26,
  labelFill: "#FBF9F5",
  edgeStroke: "#1C2A2E",
  edgeOpacity: 0.4,
  nodeStroke: "rgba(28, 42, 46, 0.35)",
  pinnedStroke: "#FBF9F5",
};

export const DESERT_PALETTE: MapThemePalette = {
  id: "desert",
  base: "#D4C3A3",
  bands: ["#EDE3D0", "#E0D2B5", "#D4C3A3", "#C4AE86", "#B09A6E", "#9A8458"],
  contour: "#5C4A32",
  contourOpacity: 0.3,
  labelFill: "#1C2A2E",
  edgeStroke: "#5C4A32",
  edgeOpacity: 0.45,
  nodeStroke: "rgba(28, 42, 46, 0.3)",
  pinnedStroke: "#1C2A2E",
};

const BY_ID: Record<MapThemeId, MapThemePalette> = {
  plant: PLANT_PALETTE,
  ocean: OCEAN_PALETTE,
  desert: DESERT_PALETTE,
};

export function paletteFor(theme: MapThemeId): MapThemePalette {
  return BY_ID[theme];
}
