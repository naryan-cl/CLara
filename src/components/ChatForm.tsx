"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  sendChatMessage,
  autosaveReflectDraft,
  submitReflectConversation,
  type ChatMessage,
} from "@/app/(app)/chat/actions";
import { FadeRise } from "@/components/motion/FadeRise";
import { ThinkingPresence } from "@/components/motion/ThinkingPresence";
import { ListeningPresence } from "@/components/motion/ListeningPresence";
import { FlowerMark } from "@/components/FlowerMark";
import type { SessionSummary } from "@/lib/sessions/types";

const AUTOSAVE_MS = 1200;
const SUBMIT_AFTER_USER_TURNS = 2;

type Props = {
  sessionIds: string[];
  connectedSessions: SessionSummary[];
  relatedDocumentIds?: string[];
  relatedSessionIds?: string[];
};

function countUserTurns(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

function buildSeedMessages(sessions: SessionSummary[]): ChatMessage[] {
  const seeds = sessions
    .map((s) => s.seed_question?.trim())
    .filter((q): q is string => Boolean(q));
  if (seeds.length === 0) return [];
  if (seeds.length === 1) {
    return [{ role: "assistant", content: seeds[0]! }];
  }
  return [
    {
      role: "assistant",
      content: seeds.map((q, i) => `${i + 1}. ${q}`).join("\n\n"),
    },
  ];
}

export function ChatForm({
  sessionIds,
  connectedSessions,
  relatedDocumentIds = [],
  relatedSessionIds = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const documentIdRef = useRef<string | null>(null);
  /** Default public — opt into private. */
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingNotice, setSavingNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasUserStarted, setHasUserStarted] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setDraftDocumentId(id: string) {
    documentIdRef.current = id;
    setDocumentId(id);
  }

  // Inject seed questions as opening CLara messages when connections change,
  // until the participant sends their first message.
  useEffect(() => {
    if (hasUserStarted) return;
    setMessages(buildSeedMessages(connectedSessions));
  }, [connectedSessions, hasUserStarted]);

  function scheduleAutosave(nextMessages: ChatMessage[]) {
    if (!nextMessages.some((m) => m.role === "user")) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void runAutosave(nextMessages);
    }, AUTOSAVE_MS);
  }

  async function runAutosave(nextMessages: ChatMessage[]) {
    setSaveError(null);
    setSavingNotice(true);
    const result = await autosaveReflectDraft(
      nextMessages,
      isPrivate ? "private" : "public",
      sessionIds,
      documentIdRef.current,
    );
    if (!result.ok) {
      setSaveError(result.error);
      setSavingNotice(false);
      return;
    }
    setDraftDocumentId(result.documentId);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setSavingNotice(false), 1600);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!messages.some((m) => m.role === "user")) return;
    scheduleAutosave(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrivate, sessionIds.join(",")]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    setError(null);

    if (!trimmed) {
      setError("Say something first.");
      return;
    }

    setHasUserStarted(true);
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setDraft("");
    scheduleAutosave(nextMessages);

    startTransition(async () => {
      const result = await sendChatMessage(nextMessages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages((current) => {
        const withAssistant = [...current, result.message];
        scheduleAutosave(withAssistant);
        return withAssistant;
      });
    });
  }

  async function onSubmitReflection() {
    setSubmitting(true);
    setSaveError(null);
    const result = await submitReflectConversation(
      messages,
      isPrivate ? "private" : "public",
      sessionIds,
      documentId,
      { relatedDocumentIds, relatedSessionIds },
    );
    if (!result.ok) {
      setSaveError(result.error);
      setSubmitting(false);
      return;
    }
    setDraftDocumentId(result.documentId);

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.65 },
      colors: ["#7A9B76", "#C4A574", "#D4B896", "#F5F0E8", "#4a6741"],
    });
    setShowThanks(true);

    window.setTimeout(() => {
      router.push("/dashboard");
    }, 2800);
  }

  const userTurns = countUserTurns(messages);
  const canSubmit = userTurns >= SUBMIT_AFTER_USER_TURNS;

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex min-h-[16rem] flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        {messages.length === 0 ? (
          <ListeningPresence />
        ) : (
          messages.map((message, index) => (
            <FadeRise
              key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
              className={
                message.role === "assistant"
                  ? "max-w-2xl rounded-lg border border-cloud bg-paper p-4 shadow-soft"
                  : "max-w-2xl self-end rounded-lg bg-forest/10 p-4"
              }
            >
              {message.role === "assistant" && (
                <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-sage">
                  CLARA
                </span>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                {message.content}
              </p>
            </FadeRise>
          ))
        )}
        {pending ? <ThinkingPresence /> : null}
      </div>

      <div className="flex min-h-[1.25rem] justify-end font-mono text-[11px] uppercase tracking-wide text-ink/40">
        {savingNotice ? "Saving…" : null}
      </div>

      {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="What's on your mind?"
          className="rounded-md border border-cloud bg-white p-3 text-sm text-ink outline-none focus:border-horizon"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || submitting}
            className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
          {canSubmit ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onSubmitReflection()}
              className="rounded-md border border-forest bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest hover:text-paper disabled:opacity-60 animate-fade-rise motion-reduce:animate-none"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          ) : null}
        </div>
        <label className="flex max-w-xl items-start gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-1 rounded border-cloud"
          />
          <span>
            Make this reflection private
            <span className="mt-0.5 block text-xs text-ink/45">
              Hidden from public Commons &amp; map; session attendees can still
              see it.
            </span>
          </span>
        </label>
      </form>

      {showThanks ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6 animate-fade-rise motion-reduce:animate-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reflect-thanks-title"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-cloud bg-paper p-8 text-center shadow-soft">
            <FlowerMark className="h-24 w-24" />
            <h2
              id="reflect-thanks-title"
              className="font-display text-xl font-medium text-ink"
            >
              Thank you for contributing to our Commons!
            </h2>
            <p className="text-sm text-ink/55">
              Taking you back to the dashboard…
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
