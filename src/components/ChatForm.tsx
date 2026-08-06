"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  sendChatMessage,
  saveChatConversation,
  type ChatMessage,
} from "@/app/(app)/chat/actions";
import { FadeRise } from "@/components/motion/FadeRise";
import { ThinkingPresence } from "@/components/motion/ThinkingPresence";

export function ChatForm() {
  const [pending, startTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [savedMessageCount, setSavedMessageCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Default Private — personal reflection; user can opt into Public Commons. */
  const [savePrivacy, setSavePrivacy] = useState<"private" | "public">(
    "private",
  );
  /** Assistant message indexes that were shared as a single exchange. */
  const [sharedIndexes, setSharedIndexes] = useState<Record<number, string>>(
    {},
  );

  const isUpToDate =
    savedDocumentId !== null && savedMessageCount === messages.length;

  function onSaveAll() {
    setSaveError(null);
    startSaveTransition(async () => {
      const result = await saveChatConversation(messages, savePrivacy);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSavedDocumentId(result.documentId);
      setSavedMessageCount(messages.length);
    });
  }

  function onShareExchange(assistantIndex: number) {
    setSaveError(null);
    const assistant = messages[assistantIndex];
    if (!assistant || assistant.role !== "assistant") return;

    const prior = messages[assistantIndex - 1];
    const snippet: ChatMessage[] =
      prior?.role === "user" ? [prior, assistant] : [assistant];

    startSaveTransition(async () => {
      const result = await saveChatConversation(snippet, savePrivacy, {
        titlePrefix: "Chat share",
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSharedIndexes((prev) => ({
        ...prev,
        [assistantIndex]: result.documentId,
      }));
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    setError(null);

    if (!trimmed) {
      setError("Say something first.");
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setDraft("");

    startTransition(async () => {
      const result = await sendChatMessage(nextMessages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages((current) => [...current, result.message]);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[16rem] flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        {messages.length === 0 ? (
          <p className="relative text-sm text-ink/50">
            <span
              className="pointer-events-none absolute -left-2 top-0 h-8 w-8 rounded-full bg-glow/15 blur-xl animate-clara-breathe motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="relative">
              Say whatever&apos;s on your mind — CLara&apos;s listening.
            </span>
          </p>
        ) : (
          messages.map((message, index) => (
            <FadeRise
              key={index}
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
              {message.role === "assistant" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {sharedIndexes[index] ? (
                    <Link
                      href={`/sessions/documents/${sharedIndexes[index]}`}
                      className="font-mono text-[11px] text-horizon hover:underline animate-success-glow motion-reduce:animate-none"
                    >
                      Shared ✓ — view
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onShareExchange(index)}
                      className="font-mono text-[11px] text-ink/50 hover:text-horizon disabled:opacity-60"
                    >
                      Share this exchange
                    </button>
                  )}
                </div>
              ) : null}
            </FadeRise>
          ))
        )}
        {pending ? <ThinkingPresence /> : null}
      </div>

      {messages.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Visibility
              </span>
              <select
                value={savePrivacy}
                onChange={(e) =>
                  setSavePrivacy(
                    e.target.value === "public" ? "public" : "private",
                  )
                }
                disabled={saving}
                className="rounded-md border border-cloud bg-sand/40 px-2 py-1.5 text-sm text-ink disabled:opacity-60"
              >
                <option value="private">Private (only you)</option>
                <option value="public">Public Commons</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onSaveAll}
              disabled={saving || isUpToDate}
              className={`rounded-md border border-cloud bg-paper px-4 py-2 text-sm font-medium text-ink transition-opacity disabled:opacity-60 ${
                isUpToDate
                  ? "animate-success-glow motion-reduce:animate-none"
                  : ""
              }`}
            >
              {saving
                ? "Saving…"
                : isUpToDate
                  ? "Saved ✓"
                  : "Save full conversation"}
            </button>
            {isUpToDate && savedDocumentId && (
              <Link
                href={`/sessions/documents/${savedDocumentId}`}
                className="text-sm text-horizon underline animate-fade-rise motion-reduce:animate-none"
              >
                View saved reflection
              </Link>
            )}
          </div>
          <p className="text-xs text-ink/45">
            Visibility applies to full-conversation saves and per-exchange
            shares.
          </p>
          {saveError && <p className="text-sm text-danger">{saveError}</p>}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="What's on your mind?"
          className="rounded-md border border-cloud bg-sand/40 p-3 text-sm text-ink outline-none focus:border-horizon"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
