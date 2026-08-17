/**
 * Circular × used to dismiss overlays (Ask detail, Commons list, Knowledge
 * Map node panel). 44px hit target, hairline border — never the word "Close".
 */
export function CloseXButton({
  onClick,
  label = "Close",
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cloud text-lg leading-none text-ink/55 transition-colors hover:border-ink/30 hover:text-ink ${className}`.trim()}
    >
      ×
    </button>
  );
}
