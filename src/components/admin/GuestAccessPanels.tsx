"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reviewGuestRequest,
  removeAllowlistEmailAction,
} from "@/app/(app)/admin/actions";
import type { StreamGuestRequest } from "@/lib/access/guest-requests";
import type { AllowlistEntry } from "@/lib/access/allowlist";

export function GuestRequestsPanel({
  requests,
}: {
  requests: StreamGuestRequest[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pendingRows = requests.filter((r) => r.status === "pending");

  function review(sessionId: string, userId: string, status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewGuestRequest(sessionId, userId, status);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        No session guest requests yet. Externals who open a join link appear
        here until you approve them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingRows.length > 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-wide text-warning">
          {pendingRows.length} pending
        </p>
      ) : null}
      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
      <ul className="flex flex-col gap-3">
        {requests.map((row) => (
          <li
            key={`${row.sessionId}:${row.userId}`}
            className="flex flex-col gap-3 border-b border-cloud pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium text-ink">{row.email}</p>
              <p className="mt-1 text-sm text-ink/60">{row.sessionName}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink/40">
                {row.status}
                {row.joinMode ? ` · ${row.joinMode}` : ""}
              </p>
            </div>
            {row.status === "pending" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => review(row.sessionId, row.userId, "approved")}
                  className="min-h-11 rounded-md bg-forest px-3 py-2 text-sm font-medium text-paper disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => review(row.sessionId, row.userId, "rejected")}
                  className="min-h-11 rounded-md border border-cloud px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AllowlistPanel({ entries }: { entries: AllowlistEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(email: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeAllowlistEmailAction(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        No pending invites. Add an email that has not signed up yet — they
        become full stream members on first login.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.email}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="break-all text-ink">{entry.email}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(entry.email)}
              className="shrink-0 rounded-md border border-cloud px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
