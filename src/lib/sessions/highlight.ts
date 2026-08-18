/**
 * Optional colour marks on sessions. Stored as DESIGN_GUIDE token names so
 * the UI stays on the product palette (not free-form hex).
 */

export const SESSION_HIGHLIGHT_COLORS = [
  "sage",
  "horizon",
  "ember",
  "glow",
] as const;

export type SessionHighlightColor = (typeof SESSION_HIGHLIGHT_COLORS)[number];

export type SessionHighlightSpec = {
  label: string;
  /** Filled circle in the editor / list. */
  swatchClass: string;
  /** Soft card wash while scanning lists. */
  washClass: string;
  /** Left-edge bar (dashboard + archive; Commons type bar is replaced). */
  barClass: string;
};

export const SESSION_HIGHLIGHTS: Record<
  SessionHighlightColor,
  SessionHighlightSpec
> = {
  sage: {
    label: "Sage",
    swatchClass: "bg-sage",
    washClass: "bg-sage/15",
    barClass: "border-l-sage",
  },
  horizon: {
    label: "Horizon",
    swatchClass: "bg-horizon",
    washClass: "bg-horizon/15",
    barClass: "border-l-horizon",
  },
  ember: {
    label: "Ember",
    swatchClass: "bg-ember",
    washClass: "bg-ember/15",
    barClass: "border-l-ember",
  },
  glow: {
    label: "Glow",
    swatchClass: "bg-glow",
    washClass: "bg-glow/25",
    barClass: "border-l-glow",
  },
};

export function parseHighlightColor(
  value: unknown,
): SessionHighlightColor | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return (SESSION_HIGHLIGHT_COLORS as readonly string[]).includes(trimmed)
    ? (trimmed as SessionHighlightColor)
    : null;
}

export function highlightListClasses(
  color: SessionHighlightColor | null | undefined,
): string {
  if (!color) return "";
  const spec = SESSION_HIGHLIGHTS[color];
  return `${spec.washClass} ${spec.barClass}`;
}
