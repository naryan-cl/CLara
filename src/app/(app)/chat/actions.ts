"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { inngest, CLARA_DOCUMENT_CREATED } from "@/lib/inngest/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT =
  "You are the CLara Chatbot, a warm and curious space for a Camp CLAI " +
  "participant to think out loud and reflect, one-on-one. Ask thoughtful " +
  "follow-up questions, listen well, and help them articulate what's " +
  "alive for them right now. You do NOT have access to the Camp CLAI " +
  "Commons, past sessions, or other participants' content — this is a " +
  "private reflective conversation, not a lookup tool. Keep replies " +
  "conversational and fairly short (a few sentences), not a lecture.";

/**
 * CLara Chatbot (input pipeline): open reflective conversation. Deliberately
 * separate from Ask CLara — no Commons retrieval, no shared prompt/state.
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

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

/**
 * Writes conversation messages into the Commons as one Reflection document.
 * Private by default; caller may pass Public. Chatbot only touches the Commons
 * through this path — turns stay ephemeral until save/share.
 */
export async function saveChatConversation(
  messages: ChatMessage[],
  privacyStatus: "public" | "private" = "private",
  options?: { titlePrefix?: string },
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

  const content = messages
    .map((message) =>
      message.role === "user"
        ? `**You:** ${message.content}`
        : `**CLara:** ${message.content}`,
    )
    .join("\n\n");

  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const title = `${options?.titlePrefix ?? "Chat reflection"} — ${dateLabel}`;

  const { document, error } = await createDocument({
    streamId: stream.id,
    createdBy: user.id,
    content,
    title,
    type: "Reflection",
    privacyStatus: privacy,
  });

  if (error || !document) {
    return { ok: false, error: error ?? "Save failed." };
  }

  try {
    await inngest.send({
      name: CLARA_DOCUMENT_CREATED,
      data: { documentId: document.id, streamId: stream.id },
    });
  } catch (err) {
    // OKF enrichment is best-effort — never fail the user's save over it.
    console.error("Failed to enqueue OKF enrichment:", err);
  }

  return { ok: true, documentId: document.id };
}
