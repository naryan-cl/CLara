import { fbm2D, seedFromString } from "./noise";
import type { TopoGenerateOptions, TopoWorld } from "./types";

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
  // Frequency tuned so a ~3k world reads as rolling terrain, not noise sand.
  const fx = 3.2;
  const fy = 2.6;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = col / Math.max(cols - 1, 1);
      const v = row / Math.max(rows - 1, 1);
      field[row * cols + col] = fbm2D(u * fx, v * fy, numericSeed, 4);
    }
  }
  return field;
}

/**
 * Marching-squares contour segments for one isolevel.
 * Returns SVG path commands (M/L) that may include many open polylines.
 */
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
  const cellW = worldW / Math.max(cols - 1, 1);
  const cellH = worldH / Math.max(rows - 1, 1);

  const at = (c: number, r: number) => field[r * cols + c] ?? 0;

  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const x = originX + c * cellW;
      const y = originY + r * cellH;
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

      const top = { x: x + cellW * lerpEdge(v0, v1), y };
      const right = { x: x + cellW, y: y + cellH * lerpEdge(v1, v2) };
      const bottom = { x: x + cellW * lerpEdge(v3, v2), y: y + cellH };
      const left = { x, y: y + cellH * lerpEdge(v0, v3) };

      const seg = (
        a: { x: number; y: number },
        b: { x: number; y: number },
      ) => {
        parts.push(
          `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        );
      };

      // Standard marching-squares edge cases (incl. simple disambiguation).
      switch (code) {
        case 1:
        case 14:
          seg(left, top);
          break;
        case 2:
        case 13:
          seg(top, right);
          break;
        case 3:
        case 12:
          seg(left, right);
          break;
        case 4:
        case 11:
          seg(right, bottom);
          break;
        case 5:
          seg(left, top);
          seg(right, bottom);
          break;
        case 6:
        case 9:
          seg(top, bottom);
          break;
        case 7:
        case 8:
          seg(left, bottom);
          break;
        case 10:
          seg(top, right);
          seg(left, bottom);
          break;
        default:
          break;
      }
    }
  }

  return parts.join("");
}

/**
 * Paint soft elevation bands into an Offscreen/canvas 2D context.
 * Lower resolution than the SVG world is OK — wash is atmospheric.
 */
export function paintElevationWash(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  field: Float32Array,
  cols: number,
  rows: number,
  bands: readonly string[],
): void {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cellW = w / cols;
  const cellH = h / rows;
  const bandCount = Math.max(bands.length, 1);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const height = field[r * cols + c] ?? 0;
      const index = Math.min(
        bandCount - 1,
        Math.floor(height * bandCount),
      );
      ctx.fillStyle = bands[index] ?? bands[0]!;
      ctx.fillRect(
        Math.floor(c * cellW),
        Math.floor(r * cellH),
        Math.ceil(cellW) + 1,
        Math.ceil(cellH) + 1,
      );
    }
  }
}

function canvasToDataUrl(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): string {
  // Node / SSR: no document — caller must only run this in the browser.
  if (typeof document === "undefined") {
    return "";
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  paint(ctx);
  try {
    const webp = canvas.toDataURL("image/webp", 0.72);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {
    // Some environments reject webp encoding — fall through to PNG.
  }
  return canvas.toDataURL("image/png");
}

/**
 * Build a large unique topo world: raster wash + SVG contour path.
 * Call on the client (needs canvas for the wash data URL).
 */
export function generateTopoWorld(options: TopoGenerateOptions): TopoWorld {
  const {
    width,
    height,
    originX,
    originY,
    seed,
    palette,
    levels = 9,
    cols = 96,
    rows = 72,
  } = options;

  const field = sampleHeightField(cols, rows, seed);

  // Raster a bit larger than CSS pixels so zoom ≤ ~2.5 stays soft, not blocky.
  const rasterScale = 1.35;
  const rasterW = Math.max(64, Math.round(width * rasterScale));
  const rasterH = Math.max(64, Math.round(height * rasterScale));

  const washHref = canvasToDataUrl(rasterW, rasterH, (ctx) => {
    paintElevationWash(ctx, field, cols, rows, palette.bands);
  });

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

  return {
    originX,
    originY,
    width,
    height,
    washHref,
    contourPath: contourParts.join(""),
    palette,
  };
}

/**
 * World bounds padded around the current viewport so pan reveals terrain.
 * Graph layout seeds near (viewportW/2, viewportH/2).
 */
export function worldBoundsForViewport(
  viewportW: number,
  viewportH: number,
): { originX: number; originY: number; width: number; height: number } {
  const padX = Math.max(900, viewportW * 0.85);
  const padY = Math.max(700, viewportH * 0.85);
  return {
    originX: -padX,
    originY: -padY,
    width: viewportW + padX * 2,
    height: viewportH + padY * 2,
  };
}
