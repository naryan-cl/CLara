"use server";

import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import {
  normalizeSessionIdsForContribution,
  resolveContributionContext,
} from "@/lib/access/resolve-contribution";
import { getContributionSupabase } from "@/lib/access/contribution-client";
import { getEffectiveSystemPrompt } from "@/lib/prompts/get-stream-prompts";
import { createDocument } from "@/lib/documents/create-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { setDocumentLinks } from "@/lib/documents/set-document-links";
import {
  enqueueDocumentCreated,
  enqueueDocumentSummarize,
} from "@/lib/embeddings/enqueue-document-created";
import {
  formatGuidedPreamble,
  type ReflectFlow,
} from "@/lib/sessions/reflect-flow";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

export type ReflectChatContext = {
  sessionName?: string | null;
  questions: string[];
  /** 0-based index of the question currently in focus. */
  currentQuestionIndex: number;
  /** True while still on the welcome / intro turn. */
  onWelcome?: boolean;
  /**
   * How many user replies have already happened on the current question
   * (after it was introduced). Used to cap follow-ups.
   */
  followUpsOnCurrent?: number;
};

const MAX_GUIDED_FOLLOW_UPS = 2;
/** User replies on a question before Clara must introduce the next one. */
const MAX_USER_REPLIES_BEFORE_ADVANCE = MAX_GUIDED_FOLLOW_UPS + 1;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;

function buildReflectContextSuffix(ctx: ReflectChatContext): string {
  const total = ctx.questions.length;
  const list = ctx.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const sessionLine = ctx.sessionName?.trim()
    ? `Session: ${ctx.sessionName.trim()}\n`
    : "";
  const followUps = ctx.followUpsOnCurrent ?? 0;

  if (ctx.onWelcome) {
    const q1 = ctx.questions[0]?.trim() || "(first question)";
    return (
      `\n\n---\nGuided reflection context\n${sessionLine}` +
      `Questions in this gathering:\n${list}\n\n` +
      `The participant just replied to your welcome. Briefly acknowledge ` +
      `without praise (one short sentence), then introduce the first question. You MUST ` +
      `include this exact marker line on its own, then the question text:\n` +
      `### Question 1 of ${total}: ${q1}\n` +
      `Do not ask follow-up probes yet — introduce question 1 now.`
    );
  }

  const current =
    ctx.questions[ctx.currentQuestionIndex]?.trim() ||
    "(no current question)";
  const nextIndex = ctx.currentQuestionIndex + 1;
  const hasNext = nextIndex < total;
  const nextQ = hasNext ? ctx.questions[nextIndex]!.trim() : null;
  const shouldAdvance =
    hasNext && followUps >= MAX_USER_REPLIES_BEFORE_ADVANCE;

  let guidance: string;
  if (!hasNext) {
    guidance =
      `This is the last guided question. Ask at most one brief follow-up ` +
      `if needed, then invite them to share anything else or Submit. ` +
      `Do not invent new inquiry questions.`;
  } else if (shouldAdvance) {
    guidance =
      `You have already explored this question enough (${followUps} participant ` +
      `replies). Do NOT ask another follow-up. In this reply, briefly close ` +
      `the current thread (one sentence), then introduce the next question. ` +
      `You MUST include this exact marker line on its own, then the question:\n` +
      `### Question ${nextIndex + 1} of ${total}: ${nextQ}\n`;
  } else {
    guidance =
      `Current focus (question ${ctx.currentQuestionIndex + 1} of ${total}): ${current}\n` +
      `Participant replies on this question so far: ${followUps}. ` +
      `Ask at most ${MAX_GUIDED_FOLLOW_UPS} short follow-ups on this topic ` +
      `(still only one question in each reply — pick the juiciest), then ` +
      `move on. Prefer one pointed follow-up when their answer is already ` +
      `rich. When you move on, introduce the next question with this exact ` +
      `marker line:\n` +
      `### Question ${nextIndex + 1} of ${total}: ${nextQ}\n`;
  }

  return (
    `\n\n---\nGuided reflection context\n${sessionLine}` +
    `Tone: no praise or flattery — short plain reflection is fine.\n` +
    `One question only per reply — pick the juiciest; never stack questions.\n` +
    `Questions in this gathering:\n${list}\n\n` +
    guidance
  );
}

/**
 * CLara Chatbot (Add · Reflect): open reflective conversation. Deliberately
 * separate from Ask CLara — no Commons retrieval, no shared prompt/state.
 * System prompt: stream override or product default (admin-editable).
 */
export async function sendChatMessage(
  history: ChatMessage[],
  sessionIds?: string[],
  reflectContext?: ReflectChatContext | null,
): Promise<ChatResult> {
  const contribution = await resolveContributionContext(sessionIds);
  if (!contribution.ok) {
    return { ok: false, error: contribution.error };
  }
  const stream = contribution.stream;

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

  const guidedSuffix =
    reflectContext && reflectContext.questions.length > 0
      ? buildReflectContextSuffix(reflectContext)
      : "";

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      { role: "system", content: systemPrompt + guidedSuffix },
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

function formatMessages(
  messages: ChatMessage[],
  guidedFlow?: ReflectFlow | null,
): string {
  const body = messages
    .map((message) =>
      message.role === "user"
        ? `**You:** ${message.content}`
        : `**CLara:** ${message.content}`,
    )
    .join("\n\n");
  if (guidedFlow && guidedFlow.questions.length > 0) {
    return `${formatGuidedPreamble(guidedFlow)}\n\n${body}`;
  }
  return body;
}

/**
 * Writes conversation messages into the Commons as one Reflection document.
 * Public by default; caller may pass Private. Optionally links 1–3 sessions.
 */
export async function saveChatConversation(
  messages: ChatMessage[],
  privacyStatus: "public" | "private" = "public",
  options?: {
    titlePrefix?: string;
    sessionIds?: string[];
    documentId?: string | null;
    relatedDocumentIds?: string[];
    relatedSessionIds?: string[];
    guidedFlow?: ReflectFlow | null;
  },
): Promise<SaveChatResult> {
  if (messages.length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }

  const privacy: "public" | "private" =
    privacyStatus === "public" ? "public" : "private";

  const contribution = await resolveContributionContext(options?.sessionIds);
  if (!contribution.ok) {
    return { ok: false, error: contribution.error };
  }
  const stream = contribution.stream;
  const writeClient = await getContributionSupabase(contribution);
  const authorUserId = contribution.userId;
  const content = formatMessages(messages, options?.guidedFlow);
  const sessionIds = normalizeSessionIdsForContribution(
    options?.sessionIds,
    contribution.requiredSessionId,
  );
  const primarySessionId = sessionIds[0] ?? null;
  const isGuestKind =
    contribution.kind === "guest" || contribution.kind === "link_guest";
  const relatedDocumentIds = isGuestKind
    ? []
    : (options?.relatedDocumentIds ?? []);
  const relatedSessionIds = isGuestKind
    ? []
    : (options?.relatedSessionIds ?? []);

  async function persistLinks(documentId: string) {
    const linkError = await linkDocumentSessions(
      documentId,
      sessionIds,
      writeClient,
    );
    if (linkError.error) return linkError.error;
    if (!authorUserId || relatedDocumentIds.length + relatedSessionIds.length === 0) {
      return null;
    }
    const relateError = await setDocumentLinks({
      streamId: stream.id,
      sourceDocumentId: documentId,
      createdBy: authorUserId,
      targetDocumentIds: relatedDocumentIds,
      targetSessionIds: relatedSessionIds,
    });
    return relateError.error;
  }

  if (options?.documentId) {
    let updateQuery = writeClient
      .from("documents")
      .update({
        content,
        privacy_status: privacy,
        session_id: primarySessionId,
        needs_review: false,
        is_draft: false,
      })
      .eq("id", options.documentId);

    if (contribution.kind === "link_guest" && contribution.linkParticipantId) {
      updateQuery = updateQuery.eq(
        "guest_participant_id",
        contribution.linkParticipantId,
      );
    } else if (contribution.userId) {
      updateQuery = updateQuery.eq("created_by", contribution.userId);
    } else {
      return { ok: false, error: "Could not update draft." };
    }

    const { data, error } = await updateQuery.select("id").maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not update draft." };
    }

    const linkErr = await persistLinks(data.id);
    if (linkErr) {
      return { ok: false, error: linkErr };
    }

    if (privacy === "public") {
      await enqueueDocumentCreated(data.id, stream.id);
    } else {
      await enqueueDocumentSummarize(data.id, stream.id);
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
    createdBy: contribution.userId,
    guestParticipantId: contribution.linkParticipantId,
    content,
    title,
    type: "Reflection",
    privacyStatus: privacy,
    sessionId: primarySessionId,
    needsReview: false,
    isDraft: false,
    participants: contribution.displayName
      ? [contribution.displayName]
      : undefined,
    supabase: writeClient,
  });

  if (error || !document) {
    return { ok: false, error: error ?? "Save failed." };
  }

  const linkErr = await persistLinks(document.id);
  if (linkErr) {
    return { ok: false, error: linkErr };
  }

  if (privacy === "public") {
    await enqueueDocumentCreated(document.id, stream.id);
  } else {
    await enqueueDocumentSummarize(document.id, stream.id);
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
  guidedFlow?: ReflectFlow | null,
): Promise<SaveChatResult> {
  if (messages.length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }

  const privacy: "public" | "private" =
    privacyStatus === "public" ? "public" : "private";

  const contribution = await resolveContributionContext(sessionIds);
  if (!contribution.ok) {
    return { ok: false, error: contribution.error };
  }
  const stream = contribution.stream;
  const writeClient = await getContributionSupabase(contribution);
  const content = formatMessages(messages, guidedFlow);
  const ids = normalizeSessionIdsForContribution(
    sessionIds,
    contribution.requiredSessionId,
  );
  const primarySessionId = ids[0] ?? null;

  if (documentId) {
    let updateQuery = writeClient
      .from("documents")
      .update({
        content,
        privacy_status: privacy,
        session_id: primarySessionId,
        is_draft: true,
      })
      .eq("id", documentId);

    if (contribution.kind === "link_guest" && contribution.linkParticipantId) {
      updateQuery = updateQuery.eq(
        "guest_participant_id",
        contribution.linkParticipantId,
      );
    } else if (contribution.userId) {
      updateQuery = updateQuery.eq("created_by", contribution.userId);
    } else {
      return { ok: false, error: "Autosave failed." };
    }

    const { data, error } = await updateQuery.select("id").maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Autosave failed." };
    }

    const linkError = await linkDocumentSessions(data.id, ids, writeClient);
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
    createdBy: contribution.userId,
    guestParticipantId: contribution.linkParticipantId,
    content,
    title: `Reflection — ${dateLabel}`,
    type: "Reflection",
    privacyStatus: privacy,
    sessionId: primarySessionId,
    needsReview: false,
    isDraft: true,
    participants: contribution.displayName
      ? [contribution.displayName]
      : undefined,
    supabase: writeClient,
  });

  if (error || !document) {
    return { ok: false, error: error ?? "Autosave failed." };
  }

  const linkError = await linkDocumentSessions(document.id, ids, writeClient);
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
  related?: {
    relatedDocumentIds?: string[];
    relatedSessionIds?: string[];
    guidedFlow?: ReflectFlow | null;
  },
): Promise<SaveChatResult> {
  return saveChatConversation(messages, privacyStatus, {
    titlePrefix: "Reflection",
    sessionIds,
    documentId,
    relatedDocumentIds: related?.relatedDocumentIds,
    relatedSessionIds: related?.relatedSessionIds,
    guidedFlow: related?.guidedFlow,
  });
}
