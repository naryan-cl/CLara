import manifest from "../../../public/map-sprites/manifest.json";
import type { MapThemeId } from "@/lib/map-theme";

/**
 * Theme-scoped sprite pools for the dashboard Knowledge Map.
 *
 * Sprite folders on disk remain Atom / Concept / Framework / Theme.
 * Dashboard Commons contribution types (Session / Chat / Record / Upload)
 * alias into those pools so `/map` keeps the extraction vocabulary.
 */

type ThemeSpriteManifest = Record<string, Record<string, string[]>>;

const SPRITE_MANIFEST = manifest as ThemeSpriteManifest;

const FALLBACK_TYPE = "Atom";
const FALLBACK_THEME: MapThemeId = "plant";

/** Map contribution / graph types onto sprite folder names. */
function spritePoolType(type: string): string {
  switch (type) {
    case "Session":
    case "Framework":
      return "Framework";
    case "Chat":
    case "Concept":
      return "Concept";
    case "Record":
    case "Theme":
      return "Theme";
    case "Upload":
    case "Atom":
      return "Atom";
    default:
      return FALLBACK_TYPE;
  }
}

/** FNV-1a 32-bit — deterministic, no Math.random, SSR-safe. */
export function stableIndex(id: string, n: number): number {
  if (n <= 0) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % n;
}

function poolFor(theme: MapThemeId, type: string): string[] {
  const themePools = SPRITE_MANIFEST[theme] ?? SPRITE_MANIFEST[FALLBACK_THEME];
  if (!themePools) return [];
  const poolKey = spritePoolType(type);
  const direct = themePools[poolKey];
  if (direct && direct.length > 0) return direct;
  return themePools[FALLBACK_TYPE] ?? [];
}

/**
 * Public URL for a node's map sprite, e.g.
 * `/map-sprites/ocean/atom/icon_03.png`.
 */
export function nodeSpriteUrl(
  theme: MapThemeId,
  type: string,
  id: string,
): string | null {
  const pool = poolFor(theme, type);
  if (pool.length === 0) return null;
  const path = pool[stableIndex(id, pool.length)];
  return path ? `/map-sprites/${path}` : null;
}

/** Draw size in SVG units — roughly radius × scale so icons fill the node. */
export function spriteSizeFor(radius: number, spriteScale = 2.1): number {
  return Math.max(28, Math.round(radius * spriteScale));
}
