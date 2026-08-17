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
import {
  defaultPromptFor,
  resolveSystemPrompt,
} from "@/lib/prompts/defaults";

/** Keep cost/latency sane — long transcripts get truncated. */
const MAX_CONTENT_CHARS = 24_000;

/** Room for a structured, multi-section brief (not a postcard). */
const MAX_SUMMARY_TOKENS = 4096;

async function loadSummarizePrompt(streamId: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("streams")
      .select("summarize_system_prompt")
      .eq("id", streamId)
      .maybeSingle();
    if (error) {
      console.error("summarize-document: load prompt failed", error.message);
      return defaultPromptFor("summarize");
    }
    const override =
      typeof data?.summarize_system_prompt === "string"
        ? data.summarize_system_prompt
        : null;
    return resolveSystemPrompt("summarize", override);
  } catch (err) {
    console.error("summarize-document: load prompt failed", err);
    return defaultPromptFor("summarize");
  }
}

async function writeElementSummary(input: {
  type: string | null;
  title: string | null;
  content: string;
  systemPrompt: string;
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
    max_tokens: MAX_SUMMARY_TOKENS,
    messages: [
      {
        role: "system",
        content: input.systemPrompt,
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

    const systemPrompt = await step.run("load-summarize-prompt", async () => {
      return loadSummarizePrompt(doc.stream_id);
    });

    const markdown = await step.run("write-summary", async () => {
      try {
        return await writeElementSummary({
          type: doc.type,
          title: doc.title,
          content: doc.content ?? "",
          systemPrompt,
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
