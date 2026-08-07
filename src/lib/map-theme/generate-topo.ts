import { fbm2D, seedFromString } from "./noise";
import type { MapThemePalette, TopoGenerateOptions, TopoWorld } from "./types";

/** In-memory cache so resize/remount does not rebuild the same world. */
const worldCache = new Map<string, TopoWorld>();

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleBilinear(
  field: Float32Array,
  cols: number,
  rows: number,
  u: number,
  v: number,
): number {
  const x = u * (cols - 1);
  const y = v * (rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v00 = field[y0 * cols + x0] ?? 0;
  const v10 = field[y0 * cols + x1] ?? 0;
  const v01 = field[y1 * cols + x0] ?? 0;
  const v11 = field[y1 * cols + x1] ?? 0;
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

/**
 * Map height [0,1] onto the band palette with smooth blending between steps
 * so washes follow the same continuous field as the contour lines.
 */
function colorForHeight(height: number, bandRgb: Rgb[]): Rgb {
  const n = Math.max(bandRgb.length, 1);
  if (n === 1) return bandRgb[0]!;
  const scaled = Math.min(n - 1.0001, Math.max(0, height) * (n - 1));
  const i0 = Math.floor(scaled);
  const i1 = Math.min(n - 1, i0 + 1);
  const t = scaled - i0;
  const a = bandRgb[i0]!;
  const b = bandRgb[i1]!;
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

/**
 * Sample a height field in [0, 1] over the world grid.
 * Pure — no DOM. Used by wash raster + contour tracing.
 */
export function sampleHeightField(
  cols: number,
  rows: number,
  seed: string,
): Float32Array {
  const numericSeed = seedFromString(seed);
  const field = new Float32Array(cols * rows);
  // Slightly lower frequency + 3 octaves keeps hills soft and generation fast.
  const fx = 2.8;
  const fy = 2.2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = col / Math.max(cols - 1, 1);
      const v = row / Math.max(rows - 1, 1);
      field[row * cols + col] = fbm2D(u * fx, v * fy, numericSeed, 3);
    }
  }
  return field;
}

/**
 * Marching-squares contour segments for one isolevel (canvas pixel space).
 * Used only while painting — not exported to the DOM.
 */
function forEachContourSegment(
  field: Float32Array,
  cols: number,
  rows: number,
  worldW: number,
  worldH: number,
  level: number,
  onSegment: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => void,
): void {
  const cellW = worldW / Math.max(cols - 1, 1);
  const cellH = worldH / Math.max(rows - 1, 1);
  const at = (c: number, r: number) => field[r * cols + c] ?? 0;

  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const x = c * cellW;
      const y = r * cellH;
      const v0 = at(c, r);
      const v1 = at(c + 1, r);
      const v2 = at(c + 1, r + 1);
      const v3 = at(c, r + 1);

      let code = 0;
      if (v0 >= level) code |= 1;
      if (v1 >= level) code |= 2;
      if (v2 >= level) code |= 4;
      if (v3 >= level) code |= 8;
      if (code === 0 || code === 15) continue;

      const lerpEdge = (a: number, b: number) => {
        const d = b - a;
        if (Math.abs(d) < 1e-6) return 0.5;
        return (level - a) / d;
      };

      const topX = x + cellW * lerpEdge(v0, v1);
      const topY = y;
      const rightX = x + cellW;
      const rightY = y + cellH * lerpEdge(v1, v2);
      const bottomX = x + cellW * lerpEdge(v3, v2);
      const bottomY = y + cellH;
      const leftX = x;
      const leftY = y + cellH * lerpEdge(v0, v3);

      switch (code) {
        case 1:
        case 14:
          onSegment(leftX, leftY, topX, topY);
          break;
        case 2:
        case 13:
          onSegment(topX, topY, rightX, rightY);
          break;
        case 3:
        case 12:
          onSegment(leftX, leftY, rightX, rightY);
          break;
        case 4:
        case 11:
          onSegment(rightX, rightY, bottomX, bottomY);
          break;
        case 5:
          onSegment(leftX, leftY, topX, topY);
          onSegment(rightX, rightY, bottomX, bottomY);
          break;
        case 6:
        case 9:
          onSegment(topX, topY, bottomX, bottomY);
          break;
        case 7:
        case 8:
          onSegment(leftX, leftY, bottomX, bottomY);
          break;
        case 10:
          onSegment(topX, topY, rightX, rightY);
          onSegment(leftX, leftY, bottomX, bottomY);
          break;
        default:
          break;
      }
    }
  }
}

/** Kept for unit smoke tests / tooling. */
export function contourPathForLevel(
  field: Float32Array,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  worldW: number,
  worldH: number,
  level: number,
): string {
  const parts: string[] = [];
  forEachContourSegment(field, cols, rows, worldW, worldH, level, (x1, y1, x2, y2) => {
    parts.push(
      `M${(originX + x1).toFixed(1)} ${(originY + y1).toFixed(1)}L${(originX + x2).toFixed(1)} ${(originY + y2).toFixed(1)}`,
    );
  });
  return parts.join("");
}

/**
 * Smooth (bilinear) elevation wash — no blocky cells.
 * Contours are drawn on the same canvas so they match the gradient exactly.
 */
export function paintSmoothTopo(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  field: Float32Array,
  cols: number,
  rows: number,
  bands: readonly string[],
  contourHex: string,
  contourOpacity: number,
  levels: number,
): void {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const bandRgb = bands.map(parseHex);
  const image = ctx.createImageData(w, h);
  const data = image.data;

  for (let y = 0; y < h; y += 1) {
    const v = h <= 1 ? 0 : y / (h - 1);
    for (let x = 0; x < w; x += 1) {
      const u = w <= 1 ? 0 : x / (w - 1);
      const height = sampleBilinear(field, cols, rows, u, v);
      const rgb = colorForHeight(height, bandRgb);
      const i = (y * w + x) * 4;
      data[i] = rgb.r;
      data[i + 1] = rgb.g;
      data[i + 2] = rgb.b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Contours in the same pixel space as the wash → exact match, rounded joins.
  const contour = parseHex(contourHex);
  ctx.strokeStyle = `rgba(${contour.r},${contour.g},${contour.b},${contourOpacity})`;
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0018);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 1; i < levels; i += 1) {
    const level = i / levels;
    forEachContourSegment(field, cols, rows, w, h, level, (x1, y1, x2, y2) => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
  }
  ctx.stroke();
}

/** @deprecated Prefer paintSmoothTopo — kept for call-site compatibility. */
export function paintElevationWash(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  field: Float32Array,
  cols: number,
  rows: number,
  bands: readonly string[],
): void {
  paintSmoothTopo(ctx, field, cols, rows, bands, "#2E4B45", 0.28, 8);
}

function canvasToDataUrl(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): string {
  if (typeof document === "undefined") {
    return "";
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return "";
  paint(ctx);
  // JPEG is much faster/smaller than PNG for soft washes; webp when available.
  try {
    const webp = canvas.toDataURL("image/webp", 0.62);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {
    // fall through
  }
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

function cacheKey(options: TopoGenerateOptions, rasterW: number, rasterH: number): string {
  return [
    options.palette.id,
    options.seed,
    Math.round(options.originX),
    Math.round(options.originY),
    Math.round(options.width),
    Math.round(options.height),
    rasterW,
    rasterH,
  ].join("|");
}

/**
 * Cap raster size so generation stays snappy on large monitors.
 * ~0.9M pixels max (~1100×800) is plenty for an atmospheric wash.
 */
function rasterSize(worldW: number, worldH: number): { w: number; h: number } {
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(worldW, worldH, 1));
  return {
    w: Math.max(64, Math.round(worldW * scale)),
    h: Math.max(64, Math.round(worldH * scale)),
  };
}

/**
 * Build a large unique topo world as one smooth raster (gradient + contours).
 * Call on the client (needs canvas). Results are cached by seed/size.
 */
export function generateTopoWorld(options: TopoGenerateOptions): TopoWorld {
  const {
    width,
    height,
    originX,
    originY,
    seed,
    palette,
    levels = 8,
    cols = 64,
    rows = 48,
  } = options;

  const { w: rasterW, h: rasterH } = rasterSize(width, height);
  const key = cacheKey(options, rasterW, rasterH);
  const cached = worldCache.get(key);
  if (cached) return cached;

  const field = sampleHeightField(cols, rows, seed);

  const washHref = canvasToDataUrl(rasterW, rasterH, (ctx) => {
    paintSmoothTopo(
      ctx,
      field,
      cols,
      rows,
      palette.bands,
      palette.contour,
      palette.contourOpacity,
      levels,
    );
  });

  const world: TopoWorld = {
    originX,
    originY,
    width,
    height,
    washHref,
    palette,
  };
  worldCache.set(key, world);
  return world;
}

/**
 * World bounds padded around the current viewport so pan reveals terrain.
 * Smaller pad than v1 → fewer pixels to generate.
 */
export function worldBoundsForViewport(
  viewportW: number,
  viewportH: number,
): { originX: number; originY: number; width: number; height: number } {
  const padX = Math.max(480, viewportW * 0.45);
  const padY = Math.max(360, viewportH * 0.45);
  return {
    originX: -padX,
    originY: -padY,
    width: viewportW + padX * 2,
    height: viewportH + padY * 2,
  };
}

/** Quantize viewport so tiny ResizeObserver jitter does not regenerate. */
export function quantizedViewport(
  width: number,
  height: number,
  step = 64,
): { width: number; height: number } {
  return {
    width: Math.max(step, Math.round(width / step) * step),
    height: Math.max(step, Math.round(height / step) * step),
  };
}

export function clearTopoWorldCache(): void {
  worldCache.clear();
}

/** Exported for tests that assert palette wiring. */
export function _colorForHeightForTests(
  height: number,
  bands: readonly string[],
): Rgb {
  return colorForHeight(height, bands.map(parseHex));
}

export type { MapThemePalette };
