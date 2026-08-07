import { fbm2D, seedFromString, valueNoise2D } from "./noise";
import type {
  MapThemePalette,
  TopoGenerateOptions,
  TopoWashBlob,
  TopoWorld,
} from "./types";

/** Cache procedural path sets — cheap strings, still avoid recompute on remount. */
const worldCache = new Map<string, TopoWorld>();

/**
 * Sample a height field in [0, 1] over the world grid.
 */
export function sampleHeightField(
  cols: number,
  rows: number,
  seed: string,
): Float32Array {
  const numericSeed = seedFromString(seed);
  const field = new Float32Array(cols * rows);
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

function forEachContourSegment(
  field: Float32Array,
  cols: number,
  rows: number,
  worldW: number,
  worldH: number,
  level: number,
  onSegment: (x1: number, y1: number, x2: number, y2: number) => void,
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
 * Soft elliptical washes placed from the seed — procedural color variation
 * without a bitmap (stays crisp under zoom).
 */
export function generateWashBlobs(
  originX: number,
  originY: number,
  width: number,
  height: number,
  seed: string,
  bands: readonly string[],
  count = 7,
): TopoWashBlob[] {
  const numericSeed = seedFromString(`${seed}:wash`);
  const blobs: TopoWashBlob[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = valueNoise2D(i * 1.7, 0.3, numericSeed);
    const v = valueNoise2D(0.4, i * 2.1, numericSeed + 17);
    const s = valueNoise2D(i * 0.9, i * 1.3, numericSeed + 41);
    const band = bands[i % bands.length] ?? bands[0]!;
    blobs.push({
      cx: originX + u * width,
      cy: originY + v * height,
      rx: width * (0.18 + s * 0.28),
      ry: height * (0.16 + (1 - s) * 0.26),
      fill: band,
      opacity: 0.22 + (i % 3) * 0.06,
    });
  }
  return blobs;
}

function cacheKey(options: TopoGenerateOptions): string {
  return [
    options.palette.id,
    options.seed,
    Math.round(options.originX),
    Math.round(options.originY),
    Math.round(options.width),
    Math.round(options.height),
  ].join("|");
}

/**
 * Procedural SVG topo world: soft wash ellipses + contour paths.
 * No canvas / data-URL — fast to build and sharp at any zoom.
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
    cols = 56,
    rows = 42,
  } = options;

  const key = cacheKey(options);
  const cached = worldCache.get(key);
  if (cached) return cached;

  const field = sampleHeightField(cols, rows, seed);
  const contourParts: string[] = [];
  for (let i = 1; i < levels; i += 1) {
    const level = i / levels;
    const d = contourPathForLevel(
      field,
      cols,
      rows,
      originX,
      originY,
      width,
      height,
      level,
    );
    if (d) contourParts.push(d);
  }

  const world: TopoWorld = {
    originX,
    originY,
    width,
    height,
    washes: generateWashBlobs(
      originX,
      originY,
      width,
      height,
      seed,
      palette.bands,
    ),
    contourPath: contourParts.join(""),
    palette,
  };
  worldCache.set(key, world);
  return world;
}

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

/** @deprecated Raster path removed — kept so old imports do not crash builds. */
export function paintElevationWash(): void {
  /* no-op */
}

export function paintSmoothTopo(): void {
  /* no-op */
}

export type { MapThemePalette };
