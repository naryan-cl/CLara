/**
 * Visual tokens for Commons element-type colour coding.
 * Uses DESIGN_GUIDE palette (sage / ember / forest / horizon) — not purple.
 */

export type CommonsColourKey = "chat" | "record" | "upload" | "session" | "other";

export const COMMONS_TYPE_COLOURS: Record<
  CommonsColourKey,
  { label: string; swatchClass: string; borderClass: string; textClass: string }
> = {
  chat: {
    label: "Chat",
    swatchClass: "bg-sage",
    borderClass: "border-l-sage",
    textClass: "text-sage",
  },
  record: {
    label: "Record",
    swatchClass: "bg-ember",
    borderClass: "border-l-ember",
    textClass: "text-ember",
  },
  upload: {
    label: "Upload",
    swatchClass: "bg-forest",
    borderClass: "border-l-forest",
    textClass: "text-forest",
  },
  session: {
    label: "Session",
    swatchClass: "bg-horizon",
    borderClass: "border-l-horizon",
    textClass: "text-horizon",
  },
  other: {
    label: "Other",
    swatchClass: "bg-ink/35",
    borderClass: "border-l-ink/35",
    textClass: "text-ink/50",
  },
};

export const COMMONS_TYPE_LEGEND: CommonsColourKey[] = [
  "chat",
  "record",
  "upload",
  "session",
  "other",
];

export function colourForElementType(
  elementType: string,
): (typeof COMMONS_TYPE_COLOURS)[CommonsColourKey] {
  if (elementType in COMMONS_TYPE_COLOURS) {
    return COMMONS_TYPE_COLOURS[elementType as CommonsColourKey];
  }
  return COMMONS_TYPE_COLOURS.other;
}
