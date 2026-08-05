"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  sendChatMessage,
  saveChatConversation,
  type ChatMessage,
} from "@/app/(app)/chat/actions";

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

  const isUpToDate =
    savedDocumentId !== null && savedMessageCount === messages.length;

  function onSave() {
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
          <p className="text-sm text-ink/50">
            Say whatever&apos;s on your mind — CLara&apos;s listening.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
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
            </div>
          ))
        )}
        {pending && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
            CLara is thinking…
          </span>
        )}
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
                disabled={saving || isUpToDate}
                className="rounded-md border border-cloud bg-sand/40 px-2 py-1.5 text-sm text-ink disabled:opacity-60"
              >
                <option value="private">Private (only you)</option>
                <option value="public">Public Commons</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || isUpToDate}
              className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm font-medium text-ink transition-opacity disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : isUpToDate
                  ? "Saved ✓"
                  : "Save conversation to Commons"}
            </button>
            {isUpToDate && savedDocumentId && (
              <Link
                href={`/sessions/documents/${savedDocumentId}`}
                className="text-sm text-horizon underline"
              >
                View saved reflection
              </Link>
            )}
          </div>
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
          className="self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
