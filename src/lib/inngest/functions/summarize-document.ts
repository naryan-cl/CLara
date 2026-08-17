import OpenAI from "openai";
import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  CLARA_DOCUMENT_SUMMARIZE,
  type ClaraDocumentCreatedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { shouldGenerateSummary } from "@/lib/documents/summary";

/** Keep prompt cost/latency sane — long transcripts get truncated. */
const MAX_CONTENT_CHARS = 12_000;

async function writeElementSummary(input: {
  type: string | null;
  title: string | null;
  content: string;
}): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });
  const kind = input.type || "document";
  const truncated = input.content.slice(0, MAX_CONTENT_CHARS);

  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content:
          "You write a short Markdown summary of one CLara Commons element " +
          "(a reflection, transcript, note, or upload). Capture the main " +
          "themes, tensions, and notable insights in 1–3 short paragraphs or " +
          "a handful of bullets. Do not invent speakers, quotes, or facts. " +
          "If the material is thin, say what little is present honestly. " +
          "This is Commons enrichment — not an Ask CLara answer and not a " +
          "reflective Chatbot reply.",
      },
      {
        role: "user",
        content:
          `Type: ${kind}\n` +
          `Title: ${input.title?.trim() || "(untitled)"}\n\n` +
          truncated,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned no summary content");
  }
  return text;
}

export const summarizeDocumentFn = inngest.createFunction(
  {
    id: "clara-summarize-document",
    retries: 2,
    concurrency: { key: "event.data.documentId", limit: 1 },
    triggers: [
      { event: CLARA_DOCUMENT_CREATED },
      { event: CLARA_DOCUMENT_SUMMARIZE },
    ],
  },
  async ({ event, step }) => {
    const { documentId } = (
      event as unknown as ClaraDocumentCreatedEvent
    ).data;

    if (!getOpenAiApiKey()) {
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const doc = await step.run("fetch-document", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .select(
          "id, stream_id, content, summary, title, type, is_draft",
        )
        .eq("id", documentId)
        .maybeSingle();

      if (error) throw new Error(`fetch-document: ${error.message}`);
      if (!data) throw new Error(`fetch-document: ${documentId} not found`);
      return data;
    });

    if (!shouldGenerateSummary({
      type: doc.type,
      content: doc.content ?? "",
      is_draft: doc.is_draft,
    })) {
      return { ok: false, skipped: "not summarizable" };
    }

    // Gathering synthesis already *is* a summary — copy, don't re-LLM.
    if (doc.type === "Summary") {
      await step.run("copy-summary-type", async () => {
        const admin = createAdminClient();
        const { error } = await admin
          .from("documents")
          .update({ summary: doc.content })
          .eq("id", documentId);
        if (error) throw new Error(`copy-summary-type: ${error.message}`);
      });
      return { ok: true, documentId, copied: true };
    }

    const markdown = await step.run("write-summary", async () => {
      try {
        return await writeElementSummary({
          type: doc.type,
          title: doc.title,
          content: doc.content ?? "",
        });
      } catch (err) {
        console.error("summarize-document: writeElementSummary failed", err);
        return null;
      }
    });

    if (!markdown) {
      return { ok: false, skipped: "summary generation failed, see logs" };
    }

    await step.run("apply-summary", async () => {
      const admin = createAdminClient();
      const { error } = await admin
        .from("documents")
        .update({ summary: markdown })
        .eq("id", documentId);
      if (error) throw new Error(`apply-summary: ${error.message}`);
    });

    return { ok: true, documentId };
  },
);
