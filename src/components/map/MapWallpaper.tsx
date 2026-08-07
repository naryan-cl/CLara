"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateTopoWorld,
  paletteFor,
  worldBoundsForViewport,
  type MapThemeId,
  type TopoWorld,
} from "@/lib/map-theme";

type Drift = { x: number; y: number };

/**
 * Generative topo wallpaper for the Knowledge Map (Phase 7 Module A).
 * Lives inside the pan/zoom `<g>` so it moves with the graph.
 * Subtle contour drift pauses when prefers-reduced-motion is set.
 */
export function MapWallpaper({
  theme,
  viewportWidth,
  viewportHeight,
  seed = "camp-clai-plant",
  reducedMotion = false,
}: {
  theme: MapThemeId;
  viewportWidth: number;
  viewportHeight: number;
  seed?: string;
  reducedMotion?: boolean;
}) {
  const [world, setWorld] = useState<TopoWorld | null>(null);
  const [drift, setDrift] = useState<Drift>({ x: 0, y: 0 });

  const bounds = useMemo(
    () => worldBoundsForViewport(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const palette = paletteFor(theme);

  useEffect(() => {
    // Canvas wash must run in the browser after mount.
    const next = generateTopoWorld({
      ...bounds,
      seed: `${seed}:${theme}:${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
      palette,
      levels: 9,
      cols: 96,
      rows: 72,
    });
    setWorld(next);
  }, [bounds, palette, seed, theme]);

  useEffect(() => {
    if (reducedMotion) {
      setDrift({ x: 0, y: 0 });
      return;
    }
    let raf = 0;
    let lastPublish = 0;
    const tick = (now: number) => {
      if (now - lastPublish >= 80) {
        lastPublish = now;
        const t = now / 1000;
        setDrift({
          x: Math.sin(t * 0.07) * 10 + Math.sin(t * 0.031) * 4,
          y: Math.cos(t * 0.055) * 8 + Math.sin(t * 0.023) * 3,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  if (!world || !world.washHref) return null;

  return (
    <g
      aria-hidden="true"
      pointerEvents="none"
      transform={`translate(${drift.x} ${drift.y})`}
    >
      <image
        href={world.washHref}
        x={world.originX}
        y={world.originY}
        width={world.width}
        height={world.height}
        preserveAspectRatio="none"
        opacity={0.95}
      />
      {world.contourPath ? (
        <path
          d={world.contourPath}
          fill="none"
          stroke={world.palette.contour}
          strokeOpacity={world.palette.contourOpacity}
          strokeWidth={1.15}
          strokeLinecap="round"
        />
      ) : null}
    </g>
  );
}
