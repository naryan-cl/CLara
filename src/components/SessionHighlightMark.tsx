import {
  SESSION_HIGHLIGHTS,
  type SessionHighlightColor,
} from "@/lib/sessions/highlight";

/** Small labelled dot so list colour is not the only cue. */
export function SessionHighlightMark({
  color,
}: {
  color: SessionHighlightColor | null | undefined;
}) {
  if (!color) return null;
  const spec = SESSION_HIGHLIGHTS[color];
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full ${spec.swatchClass}`}
      title={`Highlight: ${spec.label}`}
    >
      <span className="sr-only">Highlight: {spec.label}</span>
    </span>
  );
}
