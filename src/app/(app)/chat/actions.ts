"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getEffectiveSystemPrompt } from "@/lib/prompts/get-stream-prompts";
import { createDocument } from "@/lib/documents/create-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { enqueueDocumentCreated } from "@/lib/embeddings/enqueue-document-created";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;

/**
 * CLara Chatbot (Add · Reflect): open reflective conversation. Deliberately
 * separate from Ask CLara — no Commons retrieval, no shared prompt/state.
 * System prompt: stream override or product default (admin-editable).
 */
export async function sendChatMessage(
  history: ChatMessage[],
): Promise<ChatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to chat." };
  }

  const { stream, error: streamError } = await getActiveStream();
  if (!stream) {
    return {
      ok: false,
      error: streamError ?? "No active stream — join a stream to reflect.",
    };
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Chat isn't configured yet (missing OPENAI_API_KEY).",
    };
  }

  const trimmedHistory = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  if (trimmedHistory.length === 0) {
    return { ok: false, error: "Say something first." };
  }

  const { prompt: systemPrompt } = await getEffectiveSystemPrompt(
    stream.id,
    "reflect",
  );

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      { role: "system", content: systemPrompt },
      ...trimmedHistory,
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    return { ok: false, error: "CLara didn't respond — try again." };
  }

  return { ok: true, message: { role: "assistant", content } };
}

export type SaveChatResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

function formatMessages(messages: ChatMessage[]): string {
  return messages
    .map((message) =>
      message.role === "user"
        ? `**You:** ${message.content}`
        : `**CLara:** ${message.content}`,
    )
    .join("\n\n");
}

/**
 * Writes conversation messages into the Commons as one Reflection document.
 * Private by default; caller may pass Public. Optionally links 1–3 sessions.
 */
export async function saveChatConversation(
  messages: ChatMessage[],
  privacyStatus: "public" | "private" = "private",
  options?: {
    titlePrefix?: string;
    sessionIds?: string[];
    documentId?: string | null;
  },
): Promise<SaveChatResult> {
  if (messages.length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }

  const privacy: "public" | "private" =
    privacyStatus === "public" ? "public" : "private";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to save." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      ok: false,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const content = formatMessages(messages);
  const sessionIds = (options?.sessionIds ?? []).slice(0, 3);
  const primarySessionId = sessionIds[0] ?? null;

  if (options?.documentId) {
    const { data, error } = await supabase
      .from("documents")
      .update({
        content,
        privacy_status: privacy,
        session_id: primarySessionId,
        needs_review: false,
        is_draft: false,
      })
      .eq("id", options.documentId)
      .eq("created_by", user.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not update draft." };
    }

    const linkError = await linkDocumentSessions(data.id, sessionIds);
    if (linkError.error) {
      return { ok: false, error: linkError.error };
    }

    if (privacy === "public") {
      await enqueueDocumentCreated(data.id, stream.id);
    }

    return { ok: true, documentId: data.id };
  }

  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const title = `${options?.titlePrefix ?? "Reflection"} — ${dateLabel}`;

  const { document, error } = await createDocument({
    streamId: stream.id,
    createdBy: user.id,
    content,
    title,
    type: "Reflection",
    privacyStatus: privacy,
    sessionId: primarySessionId,
    needsReview: false,
    isDraft: false,
  });

  if (error || !document) {
    return { ok: false, error: error ?? "Save failed." };
  }

  const linkError = await linkDocumentSessions(document.id, sessionIds);
  if (linkError.error) {
    return { ok: false, error: linkError.error };
  }

  if (privacy === "public") {
    await enqueueDocumentCreated(document.id, stream.id);
  }

  return { ok: true, documentId: document.id };
}

/**
 * Autosave / upsert a draft Reflection while the participant is chatting.
 * Does not fire OKF until an explicit Submit (or public save).
 */
export async function autosaveReflectDraft(
  messages: ChatMessage[],
  privacyStatus: "public" | "private",
  sessionIds: string[],
  documentId: string | null,
): Promise<SaveChatResult> {
  if (messages.length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }

  const privacy: "public" | "private" =
    privacyStatus === "public" ? "public" : "private";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to save." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      ok: false,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  const content = formatMessages(messages);
  const ids = sessionIds.slice(0, 3);
  const primarySessionId = ids[0] ?? null;

  if (documentId) {
    const { data, error } = await supabase
      .from("documents")
      .update({
        content,
        privacy_status: privacy,
        session_id: primarySessionId,
        is_draft: true,
      })
      .eq("id", documentId)
      .eq("created_by", user.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Autosave failed." };
    }

    const linkError = await linkDocumentSessions(data.id, ids);
    if (linkError.error) {
      return { ok: false, error: linkError.error };
    }

    return { ok: true, documentId: data.id };
  }

  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const { document, error } = await createDocument({
    streamId: stream.id,
    createdBy: user.id,
    content,
    title: `Reflection — ${dateLabel}`,
    type: "Reflection",
    privacyStatus: privacy,
    sessionId: primarySessionId,
    needsReview: false,
    isDraft: true,
  });

  if (error || !document) {
    return { ok: false, error: error ?? "Autosave failed." };
  }

  const linkError = await linkDocumentSessions(document.id, ids);
  if (linkError.error) {
    return { ok: false, error: linkError.error };
  }

  return { ok: true, documentId: document.id };
}

/**
 * Final Submit: upsert content, apply privacy + session links, enqueue OKF
 * only when public.
 */
export async function submitReflectConversation(
  messages: ChatMessage[],
  privacyStatus: "public" | "private",
  sessionIds: string[],
  documentId: string | null,
): Promise<SaveChatResult> {
  return saveChatConversation(messages, privacyStatus, {
    titlePrefix: "Reflection",
    sessionIds,
    documentId,
  });
}
