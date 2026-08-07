"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  generateTopoWorld,
  paletteFor,
  quantizedViewport,
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
 * One smooth raster (gradient + baked contours) keeps load fast.
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

  // Quantize so 1px resize noise does not rebuild a multi-MB wash.
  const q = useMemo(
    () => quantizedViewport(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const bounds = useMemo(
    () => worldBoundsForViewport(q.width, q.height),
    [q.width, q.height],
  );

  const palette = paletteFor(theme);

  const world = useMemo(() => {
    if (!hasMounted) return null;
    return generateTopoWorld({
      ...bounds,
      seed: `${seed}:${theme}:${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
      palette,
      levels: 8,
      cols: 64,
      rows: 48,
    });
  }, [bounds, hasMounted, palette, seed, theme]);

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
        opacity={0.96}
      />
    </g>
  );
}
