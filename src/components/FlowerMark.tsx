/**
 * Placeholder flower for Reflect submit thank-you.
 * Knowledge Map will use flower sprites in a later phase.
 */
export function FlowerMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="14" fill="#7A9B76" />
      <ellipse cx="60" cy="28" rx="16" ry="22" fill="#C4A574" opacity="0.95" />
      <ellipse cx="60" cy="92" rx="16" ry="22" fill="#C4A574" opacity="0.95" />
      <ellipse cx="28" cy="60" rx="22" ry="16" fill="#B8956A" opacity="0.9" />
      <ellipse cx="92" cy="60" rx="22" ry="16" fill="#B8956A" opacity="0.9" />
      <ellipse
        cx="36"
        cy="36"
        rx="14"
        ry="18"
        fill="#D4B896"
        opacity="0.85"
        transform="rotate(-40 36 36)"
      />
      <ellipse
        cx="84"
        cy="36"
        rx="14"
        ry="18"
        fill="#D4B896"
        opacity="0.85"
        transform="rotate(40 84 36)"
      />
      <ellipse
        cx="36"
        cy="84"
        rx="14"
        ry="18"
        fill="#D4B896"
        opacity="0.85"
        transform="rotate(40 36 84)"
      />
      <ellipse
        cx="84"
        cy="84"
        rx="14"
        ry="18"
        fill="#D4B896"
        opacity="0.85"
        transform="rotate(-40 84 84)"
      />
      <circle cx="60" cy="60" r="8" fill="#F5F0E8" />
    </svg>
  );
}
