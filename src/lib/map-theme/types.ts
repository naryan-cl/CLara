/**
 * Map wallpaper themes (Phase 7). Wallpaper only — nodes stay plain circles.
 */

export type MapThemeId = "plant" | "ocean" | "desert";

/** Colors + contrast tokens for one biome wallpaper. */
export type MapThemePalette = {
  id: MapThemeId;
  /** Shell / hit-target fill behind the generative world. */
  base: string;
  /** Elevation washes, low → high. */
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

export type TopoGenerateOptions = {
  /** World width in graph (SVG) units. */
  width: number;
  /** World height in graph (SVG) units. */
  height: number;
  /** Top-left of the world in graph space. */
  originX: number;
  originY: number;
  seed: string;
  palette: MapThemePalette;
  /** Contour isolevel count (soft detail). */
  levels?: number;
  /** Height-field columns (higher = smoother, more work once). */
  cols?: number;
  /** Height-field rows. */
  rows?: number;
};

export type TopoWorld = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  /** Raster wash (data URL) — cheap to pan/zoom as one image. */
  washHref: string;
  /** Crisp contour polylines as a single SVG path `d`. */
  contourPath: string;
  palette: MapThemePalette;
};
