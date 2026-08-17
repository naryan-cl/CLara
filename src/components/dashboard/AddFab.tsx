"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Organic + FAB that slides out Record / Reflect / Upload (Add lens).
 * Collapses on outside click or Escape.
 * `menuAlign="end"` opens the menu toward the left (top-right placement).
 */
export function AddFab({
  menuAlign = "start",
}: {
  menuAlign?: "start" | "end";
} = {}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Solid sand hover — forest/5 looked transparent against the map.
  const actionClass =
    "flex items-center gap-2 border border-forest/30 bg-paper px-4 py-2.5 text-sm font-medium text-forest shadow-soft transition-[transform,background-color] duration-[var(--duration-ui)] ease-[var(--ease)] hover:bg-sand hover:-translate-y-px organic-ask-btn";

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close Add menu" : "Add to Commons"}
        onClick={() => setOpen((value) => !value)}
        className="organic-fab flex h-14 w-14 items-center justify-center border border-cloud/80 bg-paper text-2xl font-light text-forest shadow-soft ring-1 ring-horizon/15 transition-[transform,box-shadow] duration-[var(--duration-ui)] ease-[var(--ease)] hover:scale-105 hover:shadow-glow"
      >
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>

      {open ? (
        <div
          className={`absolute top-16 z-30 flex flex-col gap-2 animate-panel-slide-in motion-reduce:animate-none sm:flex-row sm:items-center ${
            menuAlign === "end" ? "right-0" : "left-0"
          }`}
          role="menu"
          aria-label="Add to Commons"
        >
          <Link href="/add/session" className={actionClass} role="menuitem">
            <SessionIcon />
            Session
          </Link>
          <Link href="/add/chat" className={actionClass} role="menuitem">
            <PencilIcon />
            Reflect
          </Link>
          <Link href="/add/record" className={actionClass} role="menuitem">
            <MicIcon />
            Record
          </Link>
          <Link href="/add/upload" className={actionClass} role="menuitem">
            <UploadIcon />
            Upload
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SessionIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 19c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5" />
      <path d="M14 14.5c2.2.3 4 1.8 4 4.5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="M6 9l6-6 6 6" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
