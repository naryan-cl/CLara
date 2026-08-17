"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleIsolation } from "@/app/(app)/admin/actions";

export function IsolationToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const next = !enabled;
    startTransition(async () => {
      const result = await toggleIsolation(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnabled(next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onClick}
          disabled={pending}
          className={
            enabled
              ? "relative inline-flex h-11 w-14 items-center rounded-full bg-forest px-1 transition disabled:opacity-60"
              : "relative inline-flex h-11 w-14 items-center rounded-full bg-cloud px-1 transition disabled:opacity-60"
          }
        >
          <span
            className={
              enabled
                ? "ml-auto h-5 w-5 rounded-full bg-paper transition"
                : "h-5 w-5 rounded-full bg-paper transition"
            }
          />
        </button>
        <span className="text-sm text-ink">
          Isolation is <strong>{enabled ? "on" : "off"}</strong>
        </span>
      </div>
      <p className="max-w-md text-xs text-ink/40">
        {enabled
          ? "This stream's Commons is only visible to its own members — not queryable from other streams."
          : "This stream's Commons is discoverable from other streams. Off is not the default and should be a deliberate choice."}
      </p>
      {error ? (
        <p className="font-mono text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
