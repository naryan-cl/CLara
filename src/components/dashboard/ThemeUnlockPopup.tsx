"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeThemeUnlock } from "@/app/(app)/dashboard/theme-actions";
import { themeLabel } from "@/lib/map-theme/unlocks";

/**
 * One-shot congratulations when Ocean or Desert unlocks.
 */
export function ThemeUnlockPopup({
  theme,
}: {
  theme: "ocean" | "desert";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function finish(applyNow: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeThemeUnlock(theme, applyNow);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDismissed(true);
      router.refresh();
    });
  }

  const label = themeLabel(theme);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-unlock-title"
    >
      <div className="max-w-md rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2
          id="theme-unlock-title"
          className="font-display text-xl font-medium text-ink"
        >
          New theme unlocked
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Congratulations, your contributions have unlocked the{" "}
          <strong>{label}</strong> theme! Apply it now?
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => finish(true)}
            className="btn-primary rounded-md bg-forest px-4 py-2 text-sm text-paper disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply it now"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => finish(false)}
            className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm text-ink transition hover:bg-sand disabled:opacity-50"
          >
            Not now
          </button>
        </div>
        {error ? (
          <p className="mt-3 font-mono text-xs text-danger">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
