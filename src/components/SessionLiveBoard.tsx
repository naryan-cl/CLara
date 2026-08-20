"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import QRCode from "qrcode";
import { FlowerMark } from "@/components/FlowerMark";
import {
  createGroupSession,
  finalizeSessionGathering,
  loadSessionLiveBoard,
  pollSessionLiveCounts,
  updateSessionJoinCodeAction,
} from "@/app/(app)/sessions/composer-actions";
import { AddModeLinks } from "@/components/AddModeLinks";
import { HelpTip } from "@/components/HelpTip";
import {
  hasSeenMultiInputSessionIntro,
  markMultiInputSessionIntroSeen,
} from "@/lib/sessions/multi-input-session-hint";
import {
  generateJoinCode,
  type JoinMode,
  type SessionSummary,
} from "@/lib/sessions/types";
import type { StreamPeer } from "@/lib/streams/list-stream-peers";

type Props = {
  peers: StreamPeer[];
  /** Resume an existing live board (e.g. /add/session?id=…). */
  initialSessionId?: string | null;
  loadError?: string | null;
};

const MODES: { mode: JoinMode; label: string }[] = [
  { mode: "reflect", label: "Reflect" },
  { mode: "record", label: "Record" },
  { mode: "upload", label: "Upload" },
];

/**
 * Add → Session: create a gathering, then host the live board
 * (share icons + QR, counts, Finalize).
 */
export function SessionLiveBoard({
  peers,
  initialSessionId = null,
  loadError,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [peerQuery, setPeerQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [joinPaths, setJoinPaths] = useState<Record<JoinMode, string> | null>(
    null,
  );
  const [counts, setCounts] = useState({ inProgress: 0, submitted: 0 });
  const [activeShare, setActiveShare] = useState<JoinMode | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showThanks, setShowThanks] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codePending, setCodePending] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  const loadBoard = useCallback(async (sessionId: string) => {
    const result = await loadSessionLiveBoard(sessionId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSession(result.session);
    setJoinPaths(result.joinPaths);
    setCounts(result.counts);
    setError(null);
  }, []);

  useEffect(() => {
    if (!initialSessionId) return;
    void loadBoard(initialSessionId);
  }, [initialSessionId, loadBoard]);

  useEffect(() => {
    if (initialSessionId) return;
    if (!hasSeenMultiInputSessionIntro()) {
      setIntroOpen(true);
    }
  }, [initialSessionId]);

  function dismissIntro() {
    markMultiInputSessionIntroSeen();
    setIntroOpen(false);
  }

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      void pollSessionLiveCounts(session.id).then((result) => {
        if (!result.error) {
          setCounts(result.counts);
          if (result.finalizedAt) {
            setSession((prev) =>
              prev
                ? { ...prev, finalized_at: result.finalizedAt }
                : prev,
            );
          }
        }
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!activeShare || !joinPaths) {
      setQrDataUrl(null);
      return;
    }
    const path = joinPaths[activeShare];
    const absolute =
      typeof window === "undefined"
        ? path
        : `${window.location.origin}${path}`;
    let cancelled = false;
    QRCode.toDataURL(absolute, {
      width: 180,
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
  }, [activeShare, joinPaths]);

  const filteredPeers = useMemo(() => {
    const q = peerQuery.trim().toLowerCase();
    if (!q) return peers;
    return peers.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [peers, peerQuery]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createGroupSession({
      name,
      inquiry,
      participantUserIds: participantIds,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadBoard(result.session.id);
    router.replace(`/add/session?id=${result.session.id}`);
  }

  async function shareMode(mode: JoinMode) {
    if (!joinPaths) return;
    const path = joinPaths[mode];
    const absolute = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
    setActiveShare(mode);
  }

  async function handleFinalize() {
    if (!session) return;
    setFinalizing(true);
    setError(null);
    const result = await finalizeSessionGathering(session.id);
    setFinalizing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      void confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.65 },
        colors: ["#2f5d50", "#c4a574", "#e8dcc8"],
      });
    }

    setShowThanks(true);
    window.setTimeout(() => {
      router.push(`/dashboard?select=session:${session.id}`);
    }, 2800);
  }

  function startEditCode() {
    if (!session) return;
    setCodeDraft(session.join_code);
    setEditingCode(true);
    setError(null);
  }

  function cancelEditCode() {
    setEditingCode(false);
    setCodeDraft("");
    setError(null);
  }

  async function saveJoinCode() {
    if (!session) return;
    setCodePending(true);
    setError(null);
    const result = await updateSessionJoinCodeAction(session.id, codeDraft);
    setCodePending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSession(result.session);
    setJoinPaths(result.joinPaths);
    setEditingCode(false);
    setCodeDraft("");
    setActiveShare(null);
  }

  if (showThanks) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-cloud bg-paper p-8 text-center shadow-soft">
          <FlowerMark className="h-16 w-16 text-forest" />
          <p className="font-display text-xl font-medium text-ink">
            Thank you for your contribution to the Commons
          </p>
          <p className="text-sm text-ink/55">
            Taking you to the dashboard with this gathering open…
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {introOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="multi-input-session-intro-title"
          >
            <div className="max-w-md rounded-lg border border-cloud bg-paper p-6 shadow-soft">
              <h2
                id="multi-input-session-intro-title"
                className="font-display text-xl font-medium text-ink"
              >
                Multi-input session
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink/70">
                This is a multi-input session that groups multiple reflections,
                recordings or uploads into one. If you only intend to submit one
                thing (ie one recording), use the{" "}
                <AddModeLinks /> options instead.
              </p>
              <button
                type="button"
                onClick={dismissIntro}
                className="btn-primary mt-5 rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
              >
                I understand
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            New multi-input session
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Start a gathering for others to Reflect, Record, or Upload into.
            You will get a join code and share links after you save.{" "}
            <strong className="italic">
              If you are only adding a single submission, do not use this. Use{" "}
              <AddModeLinks oxfordComma={false} /> instead.
            </strong>
          </p>
          {loadError ? (
            <p className="mt-2 text-sm text-danger">{loadError}</p>
          ) : null}
        </div>

        <form
          onSubmit={(e) => void handleCreate(e)}
          className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
              placeholder="Morning circle"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Inquiry (optional)</span>
            <textarea
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              rows={3}
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
              placeholder="What felt most alive today?"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Participants (optional)</span>
            <input
              value={peerQuery}
              onChange={(e) => setPeerQuery(e.target.value)}
              placeholder="Search stream members…"
              className="rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon"
            />
            <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border border-cloud bg-sand/20 p-2">
              {filteredPeers.map((peer) => (
                <label
                  key={peer.user_id}
                  className="flex cursor-pointer gap-2 px-1 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={participantIds.includes(peer.user_id)}
                    onChange={() => {
                      setParticipantIds((prev) =>
                        prev.includes(peer.user_id)
                          ? prev.filter((id) => id !== peer.user_id)
                          : [...prev, peer.user_id],
                      );
                    }}
                  />
                  <span>
                    {peer.display_name}
                    <span className="mt-0.5 block break-all text-xs text-ink/40 sm:ml-1 sm:mt-0 sm:inline">
                      {peer.email}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="btn-primary rounded-md bg-forest px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save session"}
          </button>
        </form>
      </div>
    );
  }

  const absoluteShare =
    activeShare && joinPaths && typeof window !== "undefined"
      ? `${window.location.origin}${joinPaths[activeShare]}`
      : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
          {session.finalized_at ? "Finalized · still accepting Adds" : "Live"}
        </p>
        <h1 className="font-display text-2xl font-medium text-ink">
          {session.name}
        </h1>
        {session.seed_question ? (
          <p className="mt-1 text-sm text-ink/60">{session.seed_question}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-cloud bg-paper p-5 shadow-soft">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
          Join code
        </p>
        {editingCode ? (
          <div className="mt-2 flex flex-col gap-3">
            <input
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus
              className="rounded-md border border-cloud bg-sand px-3 py-2 font-mono text-2xl tracking-[0.15em] text-forest outline-none focus:border-horizon"
              aria-label="Join code"
            />
            <p className="text-xs text-ink/50">
              4–8 characters. Letters and numbers only (no 0, O, 1, or I).
              Changing the code breaks old join-code links.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveJoinCode()}
                disabled={codePending || codeDraft.trim().length < 4}
                className="btn-primary rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-60"
              >
                {codePending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setCodeDraft(generateJoinCode())}
                disabled={codePending}
                className="rounded-md border border-cloud bg-sand/30 px-3 py-1.5 text-sm text-ink hover:border-horizon disabled:opacity-60"
              >
                Randomize
              </button>
              <button
                type="button"
                onClick={cancelEditCode}
                disabled={codePending}
                className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/70 hover:border-horizon disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 font-mono text-3xl tracking-[0.2em] text-forest">
              {session.join_code}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startEditCode}
                className="text-sm text-horizon underline-offset-2 hover:underline"
              >
                Edit code
              </button>
            </div>
            <p className="mt-2 text-xs text-ink/50">
              Others can enter this code under Connect on Reflect, Record, or
              Upload — or use the short share links below.
            </p>
          </>
        )}
      </div>

      <div className="rounded-lg border border-cloud bg-paper p-5 shadow-soft">
        <p className="font-medium text-ink">Invite contributions</p>
        <p className="mt-1 text-sm text-ink/55">
          Click an icon to copy its join link and show a QR code.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => void shareMode(mode)}
              className={`rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                activeShare === mode
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-cloud bg-sand/30 text-ink hover:border-horizon"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {copied ? (
          <p className="mt-2 text-xs text-forest">Link copied</p>
        ) : null}
        {activeShare && absoluteShare ? (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR to join via ${activeShare}`}
                width={140}
                height={140}
                className="rounded border border-cloud bg-white"
              />
            ) : (
              <div className="flex h-[140px] w-[140px] items-center justify-center rounded border border-cloud text-xs text-ink/40">
                QR…
              </div>
            )}
            <p className="max-w-xs break-all font-mono text-[11px] text-ink/55">
              {absoluteShare}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-cloud bg-paper p-4 text-center shadow-soft">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
            In progress
          </p>
          <p className="mt-1 font-display text-3xl text-ink">
            {counts.inProgress}
          </p>
        </div>
        <div className="rounded-lg border border-cloud bg-paper p-4 text-center shadow-soft">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
            Submitted
          </p>
          <p className="mt-1 font-display text-3xl text-ink">
            {counts.submitted}
          </p>
        </div>
      </div>

      {counts.submitted > 0 && !session.finalized_at ? (
        <div className="rounded-lg border border-horizon/40 bg-horizon/10 px-4 py-3 text-sm text-ink/75">
          {counts.submitted} contribution{counts.submitted === 1 ? "" : "s"}{" "}
          submitted — Finalize when you are ready to synthesize a session
          Summary.
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={() => void handleFinalize()}
        disabled={finalizing}
        className="btn-primary rounded-md bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-60"
      >
        {finalizing
          ? "Finalizing…"
          : session.finalized_at
            ? "Refresh synthesis"
            : "Finalize gathering"}
      </button>
      <p className="flex items-center gap-1.5 text-xs text-ink/45">
        <span>
          Finalize synthesizes submitted Adds into a Summary. People can still
          join afterward.
        </span>
        <HelpTip description="Finalize runs an automatic synthesis across structured contribution briefs. Late Adds via join code still work; refresh synthesis after new submissions." />
      </p>
    </div>
  );
}
