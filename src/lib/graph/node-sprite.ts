import manifest from "../../../public/map-sprites/manifest.json";

/**
 * Sprite pools for Knowledge Map nodes.
 *
 * Atom → mushrooms, Concept → flowering plants, Framework → cacti,
 * Theme → leafy plants. Each node picks a stable icon from its type's
 * pool via hash(node.id) so refresh / re-layout keeps the same look.
 */

type SpriteManifest = Record<string, string[]>;

const SPRITE_MANIFEST = manifest as SpriteManifest;

const FALLBACK_TYPE = "Atom";

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

function poolFor(type: string): string[] {
  const direct = SPRITE_MANIFEST[type];
  if (direct && direct.length > 0) return direct;
  return SPRITE_MANIFEST[FALLBACK_TYPE] ?? [];
}

/** Public URL for a node's map sprite, e.g. `/map-sprites/atom/icon_03.png`. */
export function nodeSpriteUrl(type: string, id: string): string | null {
  const pool = poolFor(type);
  if (pool.length === 0) return null;
  const path = pool[stableIndex(id, pool.length)];
  return path ? `/map-sprites/${path}` : null;
}

/** Draw size in SVG units — roughly 2× layout radius so icons fill the node. */
export function spriteSizeFor(radius: number): number {
  return Math.max(28, Math.round(radius * 2.1));
}
