"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { SessionSummary } from "@/lib/sessions/types";
import type { StreamPeer } from "@/lib/streams/list-stream-peers";

type Props = {
  joinPath: string;
  sessionName: string;
};

/** Share URL + QR for a newly created (or selected) session. */
export function SessionShareCard({ joinPath, sessionName }: Props) {
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
    <div className="mt-3 rounded-md border border-cloud bg-paper p-3">
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

export type SessionComposerSelection = {
  sessionIds: string[];
  sessions: SessionSummary[];
};

type SessionComposerProps = {
  sessions: SessionSummary[];
  peers: StreamPeer[];
  /** Pre-select these session ids (e.g. from /join/[token]). */
  initialSessionIds?: string[];
  /** Soft label for the create button — Reflect vs Record/Upload. */
  createLabel?: string;
  onSelectionChange: (selection: SessionComposerSelection) => void;
  onCreateSession: (input: {
    name: string;
    seedQuestion: string;
    description: string;
    relatedSessionIds: string[];
    participantUserIds: string[];
  }) => Promise<
    | { ok: true; session: SessionSummary; joinPath: string }
    | { ok: false; error: string }
  >;
  onAddParticipants?: (
    sessionId: string,
    userIds: string[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const MAX_CONNECT = 3;

/**
 * Shared Add box: connect to 1–3 sessions and/or create a group session
 * with seed question, share link/QR, and participant autocomplete.
 */
export function SessionComposer({
  sessions: initialSessions,
  peers,
  initialSessionIds = [],
  createLabel = "Create group reflection",
  onSelectionChange,
  onCreateSession,
  onAddParticipants,
}: SessionComposerProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSessionIds.slice(0, MAX_CONNECT),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [seedQuestion, setSeedQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [peerQuery, setPeerQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<{
    joinPath: string;
    name: string;
    sessionId: string;
  } | null>(null);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  useEffect(() => {
    if (initialSessionIds.length === 0) return;
    setSelectedIds((prev) => {
      const merged = [
        ...new Set([...initialSessionIds, ...prev]),
      ].slice(0, MAX_CONNECT);
      return merged;
    });
  }, [initialSessionIds]);

  useEffect(() => {
    const selected = sessions.filter((s) => selectedIds.includes(s.id));
    onSelectionChange({ sessionIds: selectedIds, sessions: selected });
    // Intentionally omit onSelectionChange from deps — parent may pass inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, sessions]);

  function toggleSession(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_CONNECT) return prev;
      return [...prev, id];
    });
  }

  function toggleRelated(id: string) {
    setRelatedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_CONNECT) return prev;
      return [...prev, id];
    });
  }

  function toggleParticipant(userId: string) {
    setParticipantIds((prev) =>
      prev.includes(userId)
        ? prev.filter((x) => x !== userId)
        : [...prev, userId],
    );
  }

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
    setPending(true);
    const result = await onCreateSession({
      name,
      seedQuestion,
      description,
      relatedSessionIds: relatedIds,
      participantUserIds: participantIds,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
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
    setSeedQuestion("");
    setDescription("");
    setRelatedIds([]);
    setParticipantIds([]);
    setShowCreate(false);
  }

  async function addMoreParticipants() {
    if (!createdShare || !onAddParticipants || participantIds.length === 0) {
      return;
    }
    setPending(true);
    const result = await onAddParticipants(
      createdShare.sessionId,
      participantIds,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setParticipantIds([]);
  }

  return (
    <section className="rounded-lg border border-cloud bg-sand/20 p-5 shadow-soft">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">
            Connect to a session / artifact
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Link this contribution to up to {MAX_CONNECT} sessions (most recent
            first). Leave empty for a stand-alone reflection.
          </p>
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-cloud bg-paper p-2">
            {sessions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-ink/45">
                No sessions yet — create one beside this list.
              </p>
            ) : (
              sessions.map((session) => {
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
                          Seed: {session.seed_question}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-medium text-ink">
              {createLabel}
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-md border border-cloud bg-paper px-3 py-1.5 text-sm text-ink hover:border-horizon"
            >
              {showCreate ? "Cancel" : "New…"}
            </button>
          </div>
          <p className="mt-1 text-sm text-ink/55">
            Name a shared container, optional seed question, then share a link
            or QR so others can join.
          </p>

          {showCreate ? (
            <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3">
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
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                  Seed question (optional)
                </span>
                <textarea
                  value={seedQuestion}
                  onChange={(e) => setSeedQuestion(e.target.value)}
                  rows={2}
                  className="rounded-md border border-cloud bg-white px-3 py-2 text-ink outline-none focus:border-horizon"
                  placeholder="What felt most alive in that session?"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                  Description (optional)
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="rounded-md border border-cloud bg-white px-3 py-2 text-ink outline-none focus:border-horizon"
                />
              </label>

              {sessions.length > 0 ? (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                    Related sessions (up to {MAX_CONNECT})
                  </p>
                  <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded-md border border-cloud bg-paper p-2">
                    {sessions.map((session) => {
                      const checked = relatedIds.includes(session.id);
                      const disabled =
                        !checked && relatedIds.length >= MAX_CONNECT;
                      return (
                        <label
                          key={`rel-${session.id}`}
                          className={`flex cursor-pointer gap-2 px-1 py-0.5 text-sm ${
                            disabled ? "opacity-40" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleRelated(session.id)}
                          />
                          {session.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                  Participants
                </p>
                <input
                  value={peerQuery}
                  onChange={(e) => setPeerQuery(e.target.value)}
                  placeholder="Search stream members…"
                  className="mt-1 w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon"
                />
                <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded-md border border-cloud bg-paper p-2">
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
                          <span className="ml-1 text-xs text-ink/40">
                            {peer.email}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
              >
                {pending ? "Creating…" : createLabel}
              </button>
            </form>
          ) : null}

          {createdShare ? (
            <>
              <SessionShareCard
                joinPath={createdShare.joinPath}
                sessionName={createdShare.name}
              />
              {onAddParticipants ? (
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={pending || participantIds.length === 0}
                    onClick={addMoreParticipants}
                    className="text-sm text-horizon hover:underline disabled:opacity-50"
                  >
                    Add selected participants to this session
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
