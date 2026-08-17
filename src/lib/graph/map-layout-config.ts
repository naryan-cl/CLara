/**
 * Tunable force-layout + visual sizes for Dashboard / Knowledge Map.
 * Product defaults match the previous hardcodes in layout.ts / KnowledgeMap.
 * Stream admins override via `/admin/map-layout` → streams.map_layout_config.
 *
 * Stored JSON is nested `{ knowledgeMap, dashboard }` so each surface saves
 * independently. A legacy flat config (chargeStrength at the top level) is
 * treated as the starting point for *both* until an admin saves a tab.
 */

export type MapNodeRadii = {
  Concept: number;
  Framework: number;
  Theme: number;
  Atom: number;
  fallback: number;
};

export type MapLayoutConfig = {
  /** d3 forceManyBody strength (negative = repulsion). */
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  /** Extra padding around each node radius for forceCollide. */
  collidePadding: number;
  radii: MapNodeRadii;
  /** Multiplier for sprite draw size ≈ radius * spriteScale. */
  spriteScale: number;
  /** Label font size in px (SVG text-[Npx]). */
  labelFontSize: number;
  /** Truncate labels longer than this (ellipsis). */
  labelMaxLength: number;
};

export const DEFAULT_MAP_LAYOUT_CONFIG: MapLayoutConfig = {
  chargeStrength: -260,
  linkDistance: 140,
  linkStrength: 0.25,
  collidePadding: 14,
  radii: {
    Concept: 26,
    Framework: 24,
    Theme: 22,
    Atom: 16,
    fallback: 18,
  },
  spriteScale: 2.1,
  labelFontSize: 11,
  labelMaxLength: 22,
};

/** Admin UI ranges — keep knobs in a sensible band. */
export const MAP_LAYOUT_RANGES = {
  chargeStrength: { min: -800, max: -40, step: 10 },
  linkDistance: { min: 40, max: 400, step: 5 },
  linkStrength: { min: 0.05, max: 1, step: 0.05 },
  collidePadding: { min: 0, max: 40, step: 1 },
  radius: { min: 8, max: 48, step: 1 },
  spriteScale: { min: 1.2, max: 3.5, step: 0.1 },
  labelFontSize: { min: 8, max: 18, step: 1 },
  labelMaxLength: { min: 8, max: 48, step: 1 },
} as const;

function finiteInRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseRadii(raw: unknown): MapNodeRadii {
  const d = DEFAULT_MAP_LAYOUT_CONFIG.radii;
  const r = MAP_LAYOUT_RANGES.radius;
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    Concept: finiteInRange(obj.Concept, r.min, r.max, d.Concept),
    Framework: finiteInRange(obj.Framework, r.min, r.max, d.Framework),
    Theme: finiteInRange(obj.Theme, r.min, r.max, d.Theme),
    Atom: finiteInRange(obj.Atom, r.min, r.max, d.Atom),
    fallback: finiteInRange(obj.fallback, r.min, r.max, d.fallback),
  };
}

/** Merge DB JSON (or partial admin edits) onto product defaults + clamp. */
export function parseMapLayoutConfig(raw: unknown): MapLayoutConfig {
  const d = DEFAULT_MAP_LAYOUT_CONFIG;
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    chargeStrength: finiteInRange(
      obj.chargeStrength,
      MAP_LAYOUT_RANGES.chargeStrength.min,
      MAP_LAYOUT_RANGES.chargeStrength.max,
      d.chargeStrength,
    ),
    linkDistance: finiteInRange(
      obj.linkDistance,
      MAP_LAYOUT_RANGES.linkDistance.min,
      MAP_LAYOUT_RANGES.linkDistance.max,
      d.linkDistance,
    ),
    linkStrength: finiteInRange(
      obj.linkStrength,
      MAP_LAYOUT_RANGES.linkStrength.min,
      MAP_LAYOUT_RANGES.linkStrength.max,
      d.linkStrength,
    ),
    collidePadding: finiteInRange(
      obj.collidePadding,
      MAP_LAYOUT_RANGES.collidePadding.min,
      MAP_LAYOUT_RANGES.collidePadding.max,
      d.collidePadding,
    ),
    radii: parseRadii(obj.radii),
    spriteScale: finiteInRange(
      obj.spriteScale,
      MAP_LAYOUT_RANGES.spriteScale.min,
      MAP_LAYOUT_RANGES.spriteScale.max,
      d.spriteScale,
    ),
    labelFontSize: finiteInRange(
      obj.labelFontSize,
      MAP_LAYOUT_RANGES.labelFontSize.min,
      MAP_LAYOUT_RANGES.labelFontSize.max,
      d.labelFontSize,
    ),
    labelMaxLength: Math.round(
      finiteInRange(
        obj.labelMaxLength,
        MAP_LAYOUT_RANGES.labelMaxLength.min,
        MAP_LAYOUT_RANGES.labelMaxLength.max,
        d.labelMaxLength,
      ),
    ),
  };
}

export function mapLayoutConfigsEqual(
  a: MapLayoutConfig,
  b: MapLayoutConfig,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type MapLayoutSurface = "knowledgeMap" | "dashboard";

export type StreamMapLayouts = {
  knowledgeMap: MapLayoutConfig;
  dashboard: MapLayoutConfig;
};

function isNestedLayouts(raw: Record<string, unknown>): boolean {
  return "knowledgeMap" in raw || "dashboard" in raw;
}

/** Parse DB JSON — nested (current) or flat (legacy 0022) or null. */
export function parseStreamMapLayouts(raw: unknown): StreamMapLayouts {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      knowledgeMap: parseMapLayoutConfig(null),
      dashboard: parseMapLayoutConfig(null),
    };
  }
  const obj = raw as Record<string, unknown>;
  if (isNestedLayouts(obj)) {
    return {
      knowledgeMap: parseMapLayoutConfig(obj.knowledgeMap ?? null),
      dashboard: parseMapLayoutConfig(obj.dashboard ?? null),
    };
  }
  return {
    knowledgeMap: parseMapLayoutConfig(obj),
    dashboard: parseMapLayoutConfig(obj),
  };
}

export function withUpdatedSurface(
  layouts: StreamMapLayouts,
  surface: MapLayoutSurface,
  config: MapLayoutConfig,
): StreamMapLayouts {
  return { ...layouts, [surface]: config };
}

export function bothLayoutsAreDefault(layouts: StreamMapLayouts): boolean {
  return (
    mapLayoutConfigsEqual(layouts.knowledgeMap, DEFAULT_MAP_LAYOUT_CONFIG) &&
    mapLayoutConfigsEqual(layouts.dashboard, DEFAULT_MAP_LAYOUT_CONFIG)
  );
}

/** Admin "?" copy — keep in one place so the panel and docs stay aligned. */
export const MAP_LAYOUT_FIELD_HELP: Record<string, string> = {
  chargeStrength:
    "How strongly nodes push each other apart. More negative = more spread out; closer to zero = a tighter cluster.",
  linkDistance:
    "Target length of the line between two connected nodes. Larger = more space along each link.",
  linkStrength:
    "How tightly connected nodes try to stay at the link distance. Higher = stiffer springs, less drift.",
  collidePadding:
    "Extra breathing room around each node so circles, sprites, and labels are less likely to overlap.",
  radiusConcept:
    "Circle size for Concepts (named ideas). Also the hit target. Largest by default.",
  radiusFramework:
    "Circle size for Frameworks (named models or methods).",
  radiusTheme:
    "Circle size for Themes (recurring topics).",
  radiusAtom:
    "Circle size for Atoms (single observations or quotes). Smallest by default.",
  radiusHighCloseness:
    "Circle size for the most central nodes (highest SNA closeness — fewest steps to everyone else).",
  radiusLowCloseness:
    "Circle size for nodes on the edge of the network (lowest closeness, including isolates).",
  radiusSession:
    "Sprite / hit-target size for Sessions (gatherings) on the Dashboard.",
  radiusChat:
    "Sprite / hit-target size for Reflect (Chat) contributions on the Dashboard.",
  radiusRecord:
    "Sprite / hit-target size for Record transcripts on the Dashboard.",
  radiusUpload:
    "Sprite / hit-target size for Uploads on the Dashboard.",
  spriteScale:
    "How large the nature icons are relative to the node radius. Dashboard only — the Knowledge Map uses coloured circles.",
  labelFontSize: "Size of the name drawn under each node, in pixels.",
  labelMaxLength:
    "How many characters of a name to show before replacing the rest with an ellipsis.",
};
