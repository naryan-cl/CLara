"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  askClara,
  getScopedAskIndexStatus,
  type AskHistoryMessage,
  type AskSource,
} from "@/app/(app)/ask/actions";
import { FadeRise } from "@/components/motion/FadeRise";
import { ThinkingPresence } from "@/components/motion/ThinkingPresence";
import type { AskScope } from "@/lib/ask/scope";
import { askScopeIsActive } from "@/lib/ask/scope";
import {
  themeAccentButtonStyle,
  type MapThemeId,
} from "@/lib/map-theme";

type AskTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: AskSource[];
};

/**
 * Ask CLara UI with in-session follow-ups.
 * Kept separate from ChatForm / Chatbot — different action, prompt, and RAG.
 *
 * `embedded` drops the outer card chrome when the parent already provides a
 * panel border (dashboard Ask box).
 * `scope` limits grounding to one document or session (map overlay handoff).
 * `initialQuestion` + `autoSubmitInitial` seed a first turn when remounting
 * after "Ask about this" from the map detail panel.
 * `minimized` hides empty-state copy (dashboard floating host).
 * `streamName` customizes the unscoped empty placeholder.
 */
export function AskForm({
  embedded = false,
  scope = null,
  initialQuestion = null,
  autoSubmitInitial = false,
  onClearScope,
  minimized = false,
  streamName,
  onConversationActive,
  onHasConversationChange,
  accentTheme = null,
}: {
  embedded?: boolean;
  scope?: AskScope | null;
  initialQuestion?: string | null;
  autoSubmitInitial?: boolean;
  onClearScope?: () => void;
  minimized?: boolean;
  streamName?: string;
  /** Fires once when the first ask starts (expands the dashboard host). */
  onConversationActive?: () => void;
  /** Reports whether a real thread (turns) is present — used to re-minimize. */
  onHasConversationChange?: (hasConversation: boolean) => void;
  /** Dashboard map theme — tints Ask / Ask follow-up. Null = default forest. */
  accentTheme?: MapThemeId | null;
} = {}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [indexHint, setIndexHint] = useState<string | null>(null);
  const didAutoSubmit = useRef(false);
  const notifiedActive = useRef(false);

  function notifyActive() {
    if (notifiedActive.current) return;
    notifiedActive.current = true;
    onConversationActive?.();
  }

  useEffect(() => {
    onHasConversationChange?.(turns.length > 0);
  }, [turns.length, onHasConversationChange]);

  // When grounded in one element, check whether Ask has chunks for it.
  useEffect(() => {
    if (!askScopeIsActive(scope)) {
      queueMicrotask(() => setIndexHint(null));
      return;
    }
    let cancelled = false;
    void (async () => {
      const status = await getScopedAskIndexStatus(scope);
      if (cancelled) return;
      if (status.error) {
        setIndexHint(null);
        return;
      }
      if (status.unknown) {
        setIndexHint(
          "Ask-index status unknown — apply migration 0019 if scoped Ask stays empty.",
        );
        return;
      }
      if (!status.indexed) {
        setIndexHint(
          "Not in Ask’s search index yet — indexing may still be running, or a stream admin can re-index from Admin → Ask index.",
        );
        return;
      }
      setIndexHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope?.documentId, scope?.sessionId, scope?.label]);

  function runAsk(
    question: string,
    history: AskHistoryMessage[],
    scopeForAsk: AskScope | null = scope,
  ) {
    setError(null);
    notifyActive();
    startTransition(async () => {
      const result = await askClara(question, history, scopeForAsk);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.indexed === false) {
        setIndexHint(
          "Not in Ask’s search index yet — indexing may still be running, or a stream admin can re-index from Admin → Ask index.",
        );
      }
      setTurns((prev) => [
        ...prev,
        { role: "user", content: question },
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
      setDraft("");
    });
  }

  useEffect(() => {
    if (!autoSubmitInitial || !initialQuestion?.trim() || didAutoSubmit.current) {
      return;
    }
    didAutoSubmit.current = true;
    runAsk(initialQuestion.trim(), [], scope ?? null);
    // Only on mount / remount with a seed question.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot seed
  }, [autoSubmitInitial, initialQuestion]);

  useEffect(() => {
    if (turns.length > 0 || pending) {
      notifyActive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify once when activity appears
  }, [turns.length, pending]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Ask something first.");
      return;
    }

    const historyForServer: AskHistoryMessage[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    runAsk(trimmed, historyForServer);
  }

  function onClear() {
    setTurns([]);
    setError(null);
    setDraft("");
    notifiedActive.current = false;
    onHasConversationChange?.(false);
  }

  const scoped = askScopeIsActive(scope);
  const showThread = !minimized;
  const unscopedPlaceholder = streamName
    ? `Ask a question about anything in the ${streamName} Commons`
    : "What came up around psychological safety this week?";

  return (
    <form
      onSubmit={onSubmit}
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col gap-3"
          : "flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
      }
    >
      {scoped && showThread ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-horizon/30 bg-horizon/5 px-3 py-2">
          <p className="text-xs text-ink/70">
            Grounded in{" "}
            <span className="min-w-0 truncate font-medium text-ink">{scope!.label}</span>
          </p>
          <button
            type="button"
            onClick={() => onClearScope?.()}
            className="min-h-11 font-mono text-xs text-horizon hover:underline"
          >
            Ask whole Commons
          </button>
        </div>
      ) : null}

      {scoped && indexHint && showThread ? (
        <p className="rounded-md border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ink/70">
          {indexHint}
        </p>
      ) : null}

      {showThread ? (
        <div
          className={`flex min-h-0 flex-col gap-4 overflow-auto ${
            minimized && turns.length === 0 && !pending ? "hidden" : "flex-1"
          }`}
        >
          {turns.length === 0 && !pending ? (
            minimized ? null : (
              <p className="relative text-sm text-ink/50">
                <span
                  className="pointer-events-none absolute -left-2 top-0 h-8 w-8 rounded-full bg-glow/15 blur-xl animate-clara-breathe motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="relative">
                  {scoped
                    ? `Ask about “${scope!.label}” — answers stay grounded in that element.`
                    : "Ask anything about this stream's Commons. You can follow up in this thread — answers stay grounded in sources, separate from Chat."}
                </span>
              </p>
            )
          ) : (
            turns.map((turn, index) => (
              <FadeRise
                key={`${turn.role}-${index}`}
                className={
                  turn.role === "user"
                    ? "ml-2 rounded-md bg-sand/60 px-3 py-2 text-sm text-ink sm:ml-8"
                    : "mr-4 flex flex-col gap-3"
                }
              >
                {turn.role === "assistant" ? (
                  <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
                    CLARA
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                  {turn.content}
                </p>
                {turn.role === "assistant" &&
                turn.sources &&
                turn.sources.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-t border-cloud pt-3">
                    {turn.sources.map((source, sourceIndex) => (
                      <FadeRise
                        key={`${source.documentId}-${sourceIndex}`}
                        as="span"
                        staggerDelayMs={Math.min(sourceIndex, 3) * 50}
                        className="inline-flex"
                      >
                        <Link
                          href={`/sessions/documents/${source.documentId}`}
                          className="max-w-full truncate rounded-pill border border-horizon/40 bg-sand/60 px-3 py-1 font-mono text-[11px] text-horizon transition-[border-color,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:border-horizon hover:-translate-y-px"
                        >
                          [{sourceIndex + 1}] {source.title}
                          {source.sessionName
                            ? ` · ${source.sessionName}`
                            : ""}
                        </Link>
                      </FadeRise>
                    ))}
                  </div>
                ) : null}
              </FadeRise>
            ))
          )}
          {pending ? <ThinkingPresence /> : null}
        </div>
      ) : null}

      <div
        className={`flex shrink-0 flex-col gap-3 ${
          showThread && (turns.length > 0 || pending || !minimized)
            ? "border-t border-cloud pt-3"
            : ""
        }`}
      >
        <label
          htmlFor="ask-question"
          className={
            turns.length === 0
              ? "sr-only"
              : "font-mono text-[11px] uppercase tracking-wide text-ink/60"
          }
        >
          {turns.length === 0
            ? "Ask a question"
            : "Follow up (same grounded thread)"}
        </label>
        <textarea
          id="ask-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={minimized && turns.length === 0 ? 2 : 3}
          placeholder={
            scoped
              ? turns.length === 0
                ? "What should we notice in this piece?"
                : "Can you say more about that?"
              : turns.length === 0
                ? unscopedPlaceholder
                : "Can you say more about that?"
          }
          className="rounded-md border border-cloud bg-sand/40 p-3 text-base text-ink outline-none focus:border-horizon sm:text-sm"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className={
              accentTheme
                ? "btn-primary organic-ask-btn min-h-11 px-4 py-2 text-sm font-medium disabled:opacity-60"
                : "btn-primary organic-ask-btn min-h-11 bg-forest px-4 py-2 text-sm font-medium text-paper ring-1 ring-glow/30 disabled:opacity-60"
            }
            style={
              accentTheme ? themeAccentButtonStyle(accentTheme) : undefined
            }
          >
            {pending ? "Asking…" : turns.length === 0 ? "Ask" : "Ask follow-up"}
          </button>
          {turns.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              className="organic-ask-btn border border-cloud px-4 py-2 text-sm text-ink/70 hover:text-ink disabled:opacity-60"
            >
              Clear thread
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
