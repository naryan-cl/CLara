"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectMapTheme } from "@/app/(app)/dashboard/theme-actions";
import {
  paletteFor,
  type MapThemeId,
} from "@/lib/map-theme";
import { themeLabel } from "@/lib/map-theme/unlocks";

/**
 * Compact unlocked-theme switcher for the dashboard chrome.
 * Selected chip uses the active theme's accent color.
 */
export function ThemePicker({
  activeTheme,
  unlocked,
}: {
  activeTheme: MapThemeId;
  unlocked: MapThemeId[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeAccent = paletteFor(activeTheme);

  function onPick(theme: MapThemeId) {
    if (theme === activeTheme || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await selectMapTheme(theme);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-1">
      <div
        className="flex items-center gap-1 rounded-md border border-cloud/80 bg-paper/95 p-1 shadow-soft"
        role="group"
        aria-label="Map theme"
      >
        {unlocked.map((theme) => {
          const selected = theme === activeTheme;
          return (
            <button
              key={theme}
              type="button"
              disabled={pending}
              aria-pressed={selected}
              onClick={() => onPick(theme)}
              className={
                selected
                  ? "rounded px-2.5 py-1 text-xs font-medium transition disabled:opacity-50"
                  : "rounded px-2.5 py-1 text-xs font-medium text-ink/70 transition hover:bg-sand hover:text-ink disabled:opacity-50"
              }
              style={
                selected
                  ? {
                      backgroundColor: activeAccent.accent,
                      color: activeAccent.accentFg,
                    }
                  : undefined
              }
            >
              {themeLabel(theme)}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="font-mono text-[11px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
