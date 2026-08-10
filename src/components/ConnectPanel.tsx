"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveJoinCodeAction } from "@/app/(app)/sessions/composer-actions";
import type { SessionSummary } from "@/lib/sessions/types";

export type RelateTarget = {
  kind: "document" | "session";
  id: string;
  title: string;
  subtitle?: string | null;
};

export type ConnectSelection = {
  /** Nested parent session(s) from join code / share link — typically 0–1. */
  sessionIds: string[];
  sessions: SessionSummary[];
  relatedDocumentIds: string[];
  relatedSessionIds: string[];
  /** Recording title only (Record page) — never creates a session. */
  documentTitle: string;
};

export const EMPTY_CONNECT: ConnectSelection = {
  sessionIds: [],
  sessions: [],
  relatedDocumentIds: [],
  relatedSessionIds: [],
  documentTitle: "",
};

type Props = {
  sessions: SessionSummary[];
  relateTargets: RelateTarget[];
  initialSessionIds?: string[];
  /** Record: show document title field above Connect. */
  showDocumentTitle?: boolean;
  documentTitleLabel?: string;
  documentTitlePlaceholder?: string;
  footer?: React.ReactNode;
  onSelectionChange: (selection: ConnectSelection) => void;
};

/**
 * Shared Connect chrome for Reflect / Record / Upload.
 * Relate = user-described edges. Join code = nest under a Session.
 * No create-session UI (that lives on Add → Session).
 */
export function ConnectPanel({
  sessions: initialSessions,
  relateTargets,
  initialSessionIds = [],
  showDocumentTitle = false,
  documentTitleLabel = "Title",
  documentTitlePlaceholder = "What did you talk about?",
  footer,
  onSelectionChange,
}: Props) {
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionIds, setSessionIds] = useState<string[]>(
    initialSessionIds.slice(0, 1),
  );
  const [relatedDocumentIds, setRelatedDocumentIds] = useState<string[]>([]);
  const [relatedSessionIds, setRelatedSessionIds] = useState<string[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [relateQuery, setRelateQuery] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  useEffect(() => {
    if (initialSessionIds.length === 0) return;
    setSessionIds((prev) => {
      const next = [...new Set([...initialSessionIds, ...prev])].slice(0, 1);
      return next;
    });
  }, [initialSessionIds]);

  useEffect(() => {
    const selected = sessions.filter((s) => sessionIds.includes(s.id));
    onSelectionChange({
      sessionIds,
      sessions: selected,
      relatedDocumentIds,
      relatedSessionIds,
      documentTitle,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionIds,
    sessions,
    relatedDocumentIds,
    relatedSessionIds,
    documentTitle,
  ]);

  useEffect(() => {
    if (!connectOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setConnectOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [connectOpen]);

  const nestedSessions = sessions.filter((s) => sessionIds.includes(s.id));

  const filteredTargets = useMemo(() => {
    const q = relateQuery.trim().toLowerCase();
    return relateTargets.filter((t) => {
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.subtitle?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [relateTargets, relateQuery]);

  function isRelated(target: RelateTarget): boolean {
    if (target.kind === "document") {
      return relatedDocumentIds.includes(target.id);
    }
    return relatedSessionIds.includes(target.id);
  }

  function toggleRelate(target: RelateTarget) {
    if (target.kind === "document") {
      setRelatedDocumentIds((prev) =>
        prev.includes(target.id)
          ? prev.filter((id) => id !== target.id)
          : [...prev, target.id].slice(0, 5),
      );
      return;
    }
    setRelatedSessionIds((prev) =>
      prev.includes(target.id)
        ? prev.filter((id) => id !== target.id)
        : [...prev, target.id].slice(0, 5),
    );
  }

  async function applyJoinCode() {
    setJoinError(null);
    setJoinPending(true);
    const result = await resolveJoinCodeAction(joinCode);
    setJoinPending(false);
    if (!result.ok) {
      setJoinError(result.error);
      return;
    }
    setSessions((prev) => {
      if (prev.some((s) => s.id === result.session.id)) return prev;
      return [result.session, ...prev];
    });
    setSessionIds([result.session.id]);
    setJoinCode("");
  }

  function clearNesting() {
    setSessionIds([]);
  }

  const relateCount = relatedDocumentIds.length + relatedSessionIds.length;

  return (
    <section className="flex flex-col gap-4">
      {showDocumentTitle ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{documentTitleLabel}</span>
          <input
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
            placeholder={documentTitlePlaceholder}
          />
        </label>
      ) : null}

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setConnectOpen((v) => !v)}
          className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-horizon"
        >
          Connect
          {sessionIds.length + relateCount > 0
            ? ` (${sessionIds.length + relateCount})`
            : ""}
        </button>

        {connectOpen ? (
          <div className="absolute left-0 z-20 mt-2 w-full min-w-[20rem] max-w-md space-y-4 rounded-lg border border-cloud bg-paper p-4 shadow-soft">
            <div>
              <p className="font-medium text-ink">Join code</p>
              <p className="mt-0.5 text-xs text-ink/50">
                Nest this Add under a group Session.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="flex-1 rounded-md border border-cloud bg-white px-3 py-2 font-mono text-sm tracking-widest outline-none focus:border-horizon"
                />
                <button
                  type="button"
                  disabled={joinPending || joinCode.trim().length < 4}
                  onClick={() => void applyJoinCode()}
                  className="rounded-md border border-cloud bg-sand/40 px-3 py-2 text-sm text-ink hover:border-horizon disabled:opacity-50"
                >
                  {joinPending ? "…" : "Join"}
                </button>
              </div>
              {joinError ? (
                <p className="mt-1 text-xs text-danger">{joinError}</p>
              ) : null}
            </div>

            <div>
              <p className="font-medium text-ink">Relate</p>
              <p className="mt-0.5 text-xs text-ink/50">
                Link related Commons elements (does not nest).
              </p>
              <input
                value={relateQuery}
                onChange={(e) => setRelateQuery(e.target.value)}
                placeholder="Search elements…"
                className="mt-2 w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon"
              />
              <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-cloud bg-sand/20 p-2">
                {filteredTargets.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-ink/45">
                    No elements found.
                  </p>
                ) : (
                  filteredTargets.map((target) => {
                    const checked = isRelated(target);
                    return (
                      <label
                        key={`${target.kind}:${target.id}`}
                        className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-sand/40"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => toggleRelate(target)}
                        />
                        <span>
                          <span className="font-medium text-ink">
                            {target.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-ink/40">
                            {target.kind}
                            {target.subtitle ? ` · ${target.subtitle}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                className="text-sm text-horizon hover:underline"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}

        {!connectOpen && nestedSessions.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {nestedSessions.map((session) => (
              <li
                key={session.id}
                className="flex items-start justify-between gap-2 rounded-md border border-forest/25 bg-forest/5 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-forest">
                    In session
                  </span>
                  <span className="mt-0.5 block font-medium text-ink">
                    {session.name}
                  </span>
                  <span className="font-mono text-xs text-ink/45">
                    {session.join_code}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearNesting}
                  className="shrink-0 font-mono text-[11px] text-ink/45 hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {!connectOpen && relateCount > 0 ? (
          <p className="mt-2 text-xs text-ink/50">
            Relating to {relateCount} element{relateCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {footer ? <div>{footer}</div> : null}
    </section>
  );
}
