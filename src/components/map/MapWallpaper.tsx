"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  generateTopoWorld,
  paletteFor,
  worldBoundsForViewport,
  type MapThemeId,
} from "@/lib/map-theme";

function subscribeMounted(callback: () => void) {
  queueMicrotask(callback);
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getMountedServerSnapshot() {
  return false;
}

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
  const driftRef = useRef<SVGGElement>(null);
  const hasMounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

  const bounds = useMemo(
    () => worldBoundsForViewport(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const palette = paletteFor(theme);

  // Client-only: canvas wash needs `document`. Derive during render after mount.
  const world = useMemo(() => {
    if (!hasMounted) return null;
    return generateTopoWorld({
      ...bounds,
      seed: `${seed}:${theme}:${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
      palette,
      levels: 9,
      cols: 96,
      rows: 72,
    });
  }, [bounds, hasMounted, palette, seed, theme]);

  // Drift via DOM attribute — avoids React re-renders every frame.
  useEffect(() => {
    const node = driftRef.current;
    if (!node) return;

    if (reducedMotion) {
      node.setAttribute("transform", "translate(0 0)");
      return;
    }

    let raf = 0;
    let lastPublish = 0;
    const tick = (now: number) => {
      if (now - lastPublish >= 80) {
        lastPublish = now;
        const t = now / 1000;
        const x = Math.sin(t * 0.07) * 10 + Math.sin(t * 0.031) * 4;
        const y = Math.cos(t * 0.055) * 8 + Math.sin(t * 0.023) * 3;
        node.setAttribute("transform", `translate(${x} ${y})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, world]);

  if (!world || !world.washHref) return null;

  return (
    <g ref={driftRef} aria-hidden="true" pointerEvents="none">
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
