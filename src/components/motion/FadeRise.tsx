/**
 * Enter animation: fade + rise 8px (DESIGN_GUIDE §6).
 * Optional staggerDelayMs for chips / list items (keep short: 40–60ms steps).
 */
export function FadeRise({
  children,
  className = "",
  staggerDelayMs = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelayMs?: number;
  as?: "div" | "span" | "li";
}) {
  return (
    <Tag
      className={`animate-fade-rise motion-reduce:animate-none ${className}`.trim()}
      style={
        staggerDelayMs > 0
          ? { animationDelay: `${staggerDelayMs}ms` }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
