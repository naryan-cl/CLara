"use client";

import { useCallback, useEffect, useState } from "react";

export type PanelSize = { width: number; height: number };

type Axis = "width" | "height";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStored(key: string): PanelSize | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    if (
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // Ignore bad / private-mode storage.
  }
  return null;
}

function initialSize(
  storageKey: string,
  defaultWidth: number,
  defaultHeight: number,
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number,
): PanelSize {
  const stored = readStored(storageKey);
  if (!stored) {
    return { width: defaultWidth, height: defaultHeight };
  }
  return {
    width: clamp(stored.width, minWidth, maxWidth),
    height: clamp(stored.height, minHeight, maxHeight),
  };
}

/**
 * Persistable width/height for floating dashboard panes.
 * Drag handlers flip sign via `grow` so left-edge and right-edge grips work.
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  storageKey: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}) {
  const [size, setSize] = useState<PanelSize>(() =>
    initialSize(
      storageKey,
      defaultWidth,
      defaultHeight,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
    ),
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(size));
    } catch {
      // Ignore quota / private mode.
    }
  }, [storageKey, size]);

  const startDrag = useCallback(
    (axis: Axis, grow: 1 | -1) =>
      (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const start = { ...size };
        const pointerId = event.pointerId;
        const target = event.currentTarget;
        target.setPointerCapture(pointerId);
        setDragging(true);

        function onMove(moveEvent: PointerEvent) {
          if (moveEvent.pointerId !== pointerId) return;
          if (axis === "width") {
            const next =
              start.width + (moveEvent.clientX - startX) * grow;
            setSize((current) => ({
              ...current,
              width: clamp(next, minWidth, maxWidth),
            }));
          } else {
            const next =
              start.height + (moveEvent.clientY - startY) * grow;
            setSize((current) => ({
              ...current,
              height: clamp(next, minHeight, maxHeight),
            }));
          }
        }

        function onUp(upEvent: PointerEvent) {
          if (upEvent.pointerId !== pointerId) return;
          target.releasePointerCapture(pointerId);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          setDragging(false);
        }

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      },
    [size, minWidth, maxWidth, minHeight, maxHeight],
  );

  return { size, dragging, startDrag, setSize };
}
