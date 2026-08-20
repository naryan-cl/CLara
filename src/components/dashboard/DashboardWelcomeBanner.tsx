"use client";

import { useState } from "react";

const STORAGE_KEY = "clara.dashboard.welcome-dismissed";

export function DashboardWelcomeBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  if (dismissed) return null;

  return (
    <div className="mb-4 rounded-lg border border-sage/40 bg-paper px-4 py-3 text-sm text-ink/80 shadow-soft">
      <p>
        <strong className="text-ink">Welcome to CLara.</strong> The Commons is{" "}
        <strong>public by default</strong> — start with{" "}
        <strong>Add → Session</strong> for a gathering, or{" "}
        <strong>Reflect</strong> for a solo conversation.{" "}
        <a href="/guide" className="text-horizon hover:underline">
          Read the guide
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        className="mt-2 text-xs font-medium text-forest hover:underline"
      >
        Got it
      </button>
    </div>
  );
}
