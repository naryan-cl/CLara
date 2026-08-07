"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { SessionSummary } from "@/lib/sessions/types";
import type { StreamPeer } from "@/lib/streams/list-stream-peers";

type ShareProps = {
  joinPath: string;
  sessionName: string;
};

/** Share URL + QR for a newly created session. */
export function SessionShareCard({ joinPath, sessionName }: ShareProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return joinPath;
    return `${window.location.origin}${joinPath}`;
  }, [joinPath]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(absoluteUrl, {
      width: 160,
      margin: 1,
      color: { dark: "#1a2e1a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [absoluteUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-md border border-cloud bg-paper p-3">
      <p className="text-sm font-medium text-ink">Share “{sessionName}”</p>
      <p className="mt-1 break-all font-mono text-[11px] text-ink/55">
        {absoluteUrl}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={`QR code to join ${sessionName}`}
            width={120}
            height={120}
            className="rounded border border-cloud bg-white"
          />
        ) : (
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded border border-cloud text-xs text-ink/40">
            QR…
          </div>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-cloud bg-sand/30 px-3 py-1.5 text-sm text-ink hover:border-horizon"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

export type SessionComposerDraft = {
  /** Session name — labeled "Title" in the details layout. */
  name: string;
  inquiry: string;
  participantUserIds: string[];
};

export type SessionComposerSelection = {
  sessionIds: string[];
  sessions: SessionSummary[];
  draft: SessionComposerDraft;
};

type SessionComposerProps = {
  sessions: SessionSummary[];
  peers: StreamPeer[];
  initialSessionIds?: string[];
  createLabel?: string;
  /**
   * `buttons` — Reflect/Upload Connect + Create controls.
   * `details` — Record: always-open Session details form (Title/Inquiry/
   * Participants/Connections). New sessions are created on record Submit
   * when Title is filled (see resolveSessionIds in AddWithSessionComposer).
   */
  variant?: "buttons" | "details";
  onSelectionChange: (selection: SessionComposerSelection) => void;
  onCreateSession: (input: {
    name: string;
    inquiry: string;
    participantUserIds: string[];
  }) => Promise<
    | { ok: true; session: SessionSummary; joinPath: string; warning?: string }
    | { ok: false; error: string }
  >;
  onAddParticipants?: (
    sessionId: string,
    userIds: string[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const MAX_CONNECT = 3;

const EMPTY_DRAFT: SessionComposerDraft = {
  name: "",
  inquiry: "",
  participantUserIds: [],
};

/**
 * Shared Add box for linking work to sessions.
 * Reflect/Upload use button pickers; Record uses an expanded details form.
 */
export function SessionComposer({
  sessions: initialSessions,
  peers,
  initialSessionIds = [],
  createLabel = "Create group reflection",
  variant = "buttons",
  onSelectionChange,
  onCreateSession,
}: SessionComposerProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSessionIds.slice(0, MAX_CONNECT),
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [name, setName] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [peerQuery, setPeerQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<{
    joinPath: string;
    name: string;
    sessionId: string;
  } | null>(null);

  const connectPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  useEffect(() => {
    if (initialSessionIds.length === 0) return;
    setSelectedIds((prev) => {
      const merged = [...new Set([...initialSessionIds, ...prev])].slice(
        0,
        MAX_CONNECT,
      );
      return merged;
    });
  }, [initialSessionIds]);

  useEffect(() => {
    const selected = sessions.filter((s) => selectedIds.includes(s.id));
    onSelectionChange({
      sessionIds: selectedIds,
      sessions: selected,
      draft: {
        name,
        inquiry,
        participantUserIds: participantIds,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, sessions, name, inquiry, participantIds]);

  useEffect(() => {
    if (!connectOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        connectPanelRef.current &&
        !connectPanelRef.current.contains(event.target as Node)
      ) {
        setConnectOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [connectOpen]);

  function toggleSession(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_CONNECT) return prev;
      return [...prev, id];
    });
  }

  function removeSession(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleParticipant(userId: string) {
    setParticipantIds((prev) =>
      prev.includes(userId)
        ? prev.filter((x) => x !== userId)
        : [...prev, userId],
    );
  }

  const selectedSessions = sessions.filter((s) => selectedIds.includes(s.id));

  const filteredSessions = sessions.filter((session) => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      session.name.toLowerCase().includes(q) ||
      (session.seed_question?.toLowerCase().includes(q) ?? false)
    );
  });

  const filteredPeers = peers.filter((peer) => {
    const q = peerQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      peer.display_name.toLowerCase().includes(q) ||
      peer.email.toLowerCase().includes(q)
    );
  });

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setPending(true);
    const result = await onCreateSession({
      name,
      inquiry,
      participantUserIds: participantIds,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (result.warning) {
      setWarning(result.warning);
    }

    setSessions((prev) => {
      if (prev.some((s) => s.id === result.session.id)) return prev;
      return [result.session, ...prev];
    });
    setSelectedIds((prev) =>
      [...new Set([result.session.id, ...prev])].slice(0, MAX_CONNECT),
    );
    setCreatedShare({
      joinPath: result.joinPath,
      name: result.session.name,
      sessionId: result.session.id,
    });
    setName("");
    setInquiry("");
    setParticipantIds([]);
    setCreateOpen(false);
  }

  const connectionsPicker = (
    <div className="space-y-2">
      <input
        value={sessionQuery}
        onChange={(e) => setSessionQuery(e.target.value)}
        placeholder="Search sessions…"
        className="w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-cloud bg-sand/20 p-2">
        {filteredSessions.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink/45">No sessions found.</p>
        ) : (
          filteredSessions.map((session) => {
            const checked = selectedIds.includes(session.id);
            const disabled = !checked && selectedIds.length >= MAX_CONNECT;
            return (
              <label
                key={session.id}
                className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-sand/40 ${
                  disabled ? "opacity-40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleSession(session.id)}
                />
                <span>
                  <span className="font-medium text-ink">{session.name}</span>
                  {session.seed_question ? (
                    <span className="mt-0.5 block text-xs text-ink/45">
                      {session.seed_question}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })
        )}
      </div>
      {selectedSessions.length > 0 ? (
        <ul className="space-y-1.5">
          {selectedSessions.map((session) => (
            <li
              key={session.id}
              className="flex items-start justify-between gap-2 rounded-md border border-cloud bg-sand/20 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-ink">{session.name}</span>
                {session.seed_question ? (
                  <span className="mt-0.5 block text-xs text-ink/50">
                    {session.seed_question}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => removeSession(session.id)}
                className="shrink-0 font-mono text-[11px] text-ink/45 hover:text-danger"
                aria-label={`Remove ${session.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const participantsPicker = (
    <div>
      <input
        value={peerQuery}
        onChange={(e) => setPeerQuery(e.target.value)}
        placeholder="Search stream members…"
        className="w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon"
      />
      <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border border-cloud bg-sand/20 p-2">
        {filteredPeers.length === 0 ? (
          <p className="px-1 text-xs text-ink/45">No matches.</p>
        ) : (
          filteredPeers.map((peer) => (
            <label
              key={peer.user_id}
              className="flex cursor-pointer gap-2 px-1 py-0.5 text-sm"
            >
              <input
                type="checkbox"
                checked={participantIds.includes(peer.user_id)}
                onChange={() => toggleParticipant(peer.user_id)}
              />
              <span>
                {peer.display_name}
                <span className="ml-1 text-xs text-ink/40">{peer.email}</span>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );

  if (variant === "details") {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">
            Session details
          </h2>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Title</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
            placeholder="Morning circle"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Inquiry</span>
          <textarea
            value={inquiry}
            onChange={(e) => setInquiry(e.target.value)}
            rows={3}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
            placeholder="What felt most alive in that session?"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Participants</span>
          {participantsPicker}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Connections</span>
          <p className="text-xs text-ink/45">
            Link up to {MAX_CONNECT} existing sessions.
          </p>
          {connectionsPicker}
        </div>

        {createdShare ? (
          <div className="space-y-2">
            {warning ? (
              <p className="text-sm text-ink/60">{warning}</p>
            ) : null}
            <SessionShareCard
              joinPath={createdShare.joinPath}
              sessionName={createdShare.name}
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Connect */}
      <div className="relative" ref={connectPanelRef}>
        <button
          type="button"
          onClick={() => {
            setConnectOpen((v) => !v);
            setCreateOpen(false);
          }}
          className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-horizon"
        >
          Connect to a session / artifact
          {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
        </button>

        {connectOpen ? (
          <div className="absolute left-0 z-20 mt-2 w-full min-w-[18rem] max-w-md rounded-lg border border-cloud bg-paper p-3 shadow-soft">
            {connectionsPicker}
            <div className="mt-2 flex justify-end">
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

        {!connectOpen && selectedSessions.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {selectedSessions.map((session) => (
              <li
                key={session.id}
                className="flex items-start justify-between gap-2 rounded-md border border-cloud bg-sand/20 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-ink">{session.name}</span>
                  {session.seed_question ? (
                    <span className="mt-0.5 block text-xs text-ink/50">
                      {session.seed_question}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => removeSession(session.id)}
                  className="shrink-0 font-mono text-[11px] text-ink/45 hover:text-danger"
                  aria-label={`Remove ${session.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Create */}
      <div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setConnectOpen(false);
            setError(null);
          }}
          className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-horizon"
        >
          {createLabel}
        </button>

        {createdShare ? (
          <div className="mt-3 space-y-2">
            {warning ? (
              <p className="text-sm text-ink/60">{warning}</p>
            ) : null}
            <SessionShareCard
              joinPath={createdShare.joinPath}
              sessionName={createdShare.name}
            />
          </div>
        ) : null}
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-session-title"
        >
          <form
            onSubmit={handleCreate}
            className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-cloud bg-paper p-5 shadow-soft"
          >
            <h2
              id="create-session-title"
              className="font-display text-lg font-medium text-ink"
            >
              {createLabel}
            </h2>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Name
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-cloud bg-white px-3 py-2 text-ink outline-none focus:border-horizon"
                placeholder="Morning circle reflections"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Inquiry (optional)
              </span>
              <textarea
                value={inquiry}
                onChange={(e) => setInquiry(e.target.value)}
                rows={3}
                className="rounded-md border border-cloud bg-white px-3 py-2 text-ink outline-none focus:border-horizon"
                placeholder="What felt most alive in that session?"
              />
            </label>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Participants (optional)
              </p>
              <div className="mt-1">{participantsPicker}</div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-md border border-cloud px-4 py-2 text-sm text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="btn-primary rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export { EMPTY_DRAFT };
