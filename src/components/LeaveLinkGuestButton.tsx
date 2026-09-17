"use client";

import { leaveLinkGuestSession } from "@/app/(public)/join/actions";

export function LeaveLinkGuestButton() {
  return (
    <form action={leaveLinkGuestSession}>
      <button
        type="submit"
        className="rounded-full border border-cloud px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-horizon/40 hover:text-ink"
      >
        Leave session
      </button>
    </form>
  );
}
