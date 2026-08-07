"use client";

import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
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
 * Procedural SVG topo wallpaper (Phase 7).
 * Vectors + soft ellipses — no raster, so zoom stays sharp and load stays light.
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
  const reactId = useId().replace(/:/g, "");
  const hasMounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

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
      cols: 56,
      rows: 42,
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

  if (!world) return null;

  return (
    <g ref={driftRef} aria-hidden="true" pointerEvents="none">
      <defs>
        {world.washes.map((wash, index) => {
          const id = `topo-wash-${reactId}-${index}`;
          return (
            <radialGradient
              key={id}
              id={id}
              gradientUnits="userSpaceOnUse"
              cx={wash.cx}
              cy={wash.cy}
              r={Math.max(wash.rx, wash.ry)}
              fx={wash.cx}
              fy={wash.cy}
            >
              <stop
                offset="0%"
                stopColor={wash.fill}
                stopOpacity={wash.opacity}
              />
              <stop offset="70%" stopColor={wash.fill} stopOpacity={0.08} />
              <stop offset="100%" stopColor={wash.fill} stopOpacity={0} />
            </radialGradient>
          );
        })}
      </defs>

      <rect
        x={world.originX}
        y={world.originY}
        width={world.width}
        height={world.height}
        fill={world.palette.base}
      />

      {world.washes.map((wash, index) => (
        <ellipse
          key={`wash-${index}`}
          cx={wash.cx}
          cy={wash.cy}
          rx={wash.rx}
          ry={wash.ry}
          fill={`url(#topo-wash-${reactId}-${index})`}
        />
      ))}

      {world.contourPath ? (
        <path
          d={world.contourPath}
          fill="none"
          stroke={world.palette.contour}
          strokeOpacity={world.palette.contourOpacity}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}
