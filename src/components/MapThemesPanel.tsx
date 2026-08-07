"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMapThemeSettings } from "@/app/(app)/admin/actions";
import type { MapThemeId } from "@/lib/map-theme";
import { MAP_THEME_IDS, themeLabel } from "@/lib/map-theme/unlocks";

export function MapThemesPanel({
  initialDefaultTheme,
  initialOceanUnlockAt,
  initialDesertUnlockAt,
}: {
  initialDefaultTheme: MapThemeId;
  initialOceanUnlockAt: number;
  initialDesertUnlockAt: number;
}) {
  const router = useRouter();
  const [defaultTheme, setDefaultTheme] =
    useState<MapThemeId>(initialDefaultTheme);
  const [oceanAt, setOceanAt] = useState(String(initialOceanUnlockAt));
  const [desertAt, setDesertAt] = useState(String(initialDesertUnlockAt));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const dirty =
    defaultTheme !== initialDefaultTheme ||
    Number(oceanAt) !== initialOceanUnlockAt ||
    Number(desertAt) !== initialDesertUnlockAt;

  function onSave() {
    setError(null);
    setSavedNote(null);
    const oceanUnlockAt = Number.parseInt(oceanAt, 10);
    const desertUnlockAt = Number.parseInt(desertAt, 10);
    if (
      !Number.isFinite(oceanUnlockAt) ||
      oceanUnlockAt < 0 ||
      !Number.isFinite(desertUnlockAt) ||
      desertUnlockAt < 0
    ) {
      setError("Thresholds must be whole numbers ≥ 0.");
      return;
    }
    startTransition(async () => {
      const result = await saveMapThemeSettings({
        defaultMapTheme: defaultTheme,
        oceanUnlockAt,
        desertUnlockAt,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedNote("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink/60">
        Plant is always available. Ocean and Desert unlock when a member
        authors enough Public, submitted Commons documents in this stream.
        Each member picks their own unlocked theme on the dashboard.
      </p>

      <label className="flex max-w-sm flex-col gap-1 text-sm text-ink">
        Default theme
        <select
          value={defaultTheme}
          onChange={(event) => {
            setDefaultTheme(event.target.value as MapThemeId);
            setSavedNote(null);
          }}
          disabled={pending}
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-sm"
        >
          {MAP_THEME_IDS.map((id) => (
            <option key={id} value={id}>
              {themeLabel(id)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex w-40 flex-col gap-1 text-sm text-ink">
          Ocean unlocks at
          <input
            type="number"
            min={0}
            step={1}
            value={oceanAt}
            onChange={(event) => {
              setOceanAt(event.target.value);
              setSavedNote(null);
            }}
            disabled={pending}
            className="rounded-md border border-cloud bg-sand px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="flex w-40 flex-col gap-1 text-sm text-ink">
          Desert unlocks at
          <input
            type="number"
            min={0}
            step={1}
            value={desertAt}
            onChange={(event) => {
              setDesertAt(event.target.value);
              setSavedNote(null);
            }}
            disabled={pending}
            className="rounded-md border border-cloud bg-sand px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="btn-primary rounded-md bg-forest px-3 py-1.5 text-sm text-paper transition disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {savedNote ? (
          <span className="text-xs text-ink/60">{savedNote}</span>
        ) : null}
      </div>
      {error ? (
        <p className="font-mono text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
