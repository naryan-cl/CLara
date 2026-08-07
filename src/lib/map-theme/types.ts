/**
 * Map wallpaper themes (Phase 7).
 * Dashboard: generative topo wallpaper + theme-scoped nature sprites.
 * `/map`: dark canvas with type-colored circles (no theme).
 */

export type MapThemeId = "plant" | "ocean" | "desert";

/** Colors + contrast tokens for one biome wallpaper. */
export type MapThemePalette = {
  id: MapThemeId;
  /** Shell / hit-target fill behind the generative world. */
  base: string;
  /** Soft wash accents (radial / ellipse fills), light → deep. */
  bands: readonly string[];
  /** Contour stroke. */
  contour: string;
  contourOpacity: number;
  /** Node label fill (must contrast with base/bands). */
  labelFill: string;
  /** Edge stroke when wallpaper is active. */
  edgeStroke: string;
  edgeOpacity: number;
  /** Subtle ring so glow nodes read on lighter fields. */
  nodeStroke: string;
  pinnedStroke: string;
};

export type TopoWashBlob = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  opacity: number;
};

export type TopoGenerateOptions = {
  width: number;
  height: number;
  originX: number;
  originY: number;
  seed: string;
  palette: MapThemePalette;
  levels?: number;
  cols?: number;
  rows?: number;
};

/** Procedural SVG topo — vectors stay sharp when the map zooms. */
export type TopoWorld = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  /** Soft atmospheric blobs (no bitmap). */
  washes: TopoWashBlob[];
  /** Contour polylines as one SVG path `d`. */
  contourPath: string;
  palette: MapThemePalette;
};
