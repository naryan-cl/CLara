"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAttendance } from "@/app/(app)/sessions/archive/actions";

export function AttendanceToggle({
  sessionId,
  initialAttending,
}: {
  sessionId: string;
  initialAttending: boolean;
}) {
  const router = useRouter();
  const [attending, setAttending] = useState(initialAttending);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const next = !attending;
    startTransition(async () => {
      const result = await toggleAttendance(sessionId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAttending(result.attending);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          attending
            ? "rounded-md border border-sage bg-sage/10 px-4 py-2 text-sm font-medium text-sage disabled:opacity-60"
            : "rounded-md border border-cloud px-4 py-2 text-sm font-medium text-ink/70 hover:text-ink disabled:opacity-60"
        }
      >
        {attending ? "✓ I attended this session" : "I attended this session"}
      </button>
      {error ? (
        <p className="font-mono text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
