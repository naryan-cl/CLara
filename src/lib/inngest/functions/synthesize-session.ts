import OpenAI from "openai";
import {
  inngest,
  CLARA_SESSION_FINALIZED,
  CLARA_DOCUMENT_CREATED,
  type ClaraSessionFinalizedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import {
  defaultPromptFor,
  resolveSystemPrompt,
} from "@/lib/prompts/defaults";
import {
  appendTruncationNote,
  truncateWithFlag,
} from "@/lib/synthesis/truncation-note";

const MAX_CONTENT_CHARS = 12_000;

type ChildContribution = {
  title: string;
  type: string | null;
  summary: string | null;
  content: string;
};

function childBodyForSynthesis(child: ChildContribution): string {
  const summary = child.summary?.trim();
  if (summary) return summary;
  return child.content.trim();
}

async function loadSynthesizePrompt(streamId: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("streams")
      .select("synthesize_system_prompt")
      .eq("id", streamId)
      .maybeSingle();
    if (error) {
      console.error("synthesize-session: load prompt failed", error.message);
      return defaultPromptFor("synthesize");
    }
    const override =
      typeof data?.synthesize_system_prompt === "string"
        ? data.synthesize_system_prompt
        : null;
    return resolveSystemPrompt("synthesize", override);
  } catch (err) {
    console.error("synthesize-session: load prompt failed", err);
    return defaultPromptFor("synthesize");
  }
}

async function synthesizeSessionMarkdown(input: {
  sessionName: string;
  inquiry: string | null;
  childBodies: ChildContribution[];
  systemPrompt: string;
}): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });
  const rawJoined = input.childBodies
    .map(
      (c, i) =>
        `### Contribution ${i + 1}: ${c.title} (${c.type ?? "Document"})\n\n${childBodyForSynthesis(c)}`,
    )
    .join("\n\n---\n\n");

  const { text: joined, wasTruncated } = truncateWithFlag(
    rawJoined,
    MAX_CONTENT_CHARS,
  );

  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content: input.systemPrompt,
      },
      {
        role: "user",
        content:
          `Session name: ${input.sessionName}\n` +
          `Inquiry: ${input.inquiry ?? "(none)"}\n\n` +
          `Contributions (structured briefs preferred when present):\n\n${joined || "(no submitted contributions yet)"}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned no synthesis content");
  }
  return appendTruncationNote(text, wasTruncated);
}

export const synthesizeSessionFn = inngest.createFunction(
  {
    id: "clara-synthesize-session",
    retries: 2,
    triggers: [{ event: CLARA_SESSION_FINALIZED }],
  },
  async ({ event, step }) => {
    const { sessionId, streamId } = (
      event as unknown as ClaraSessionFinalizedEvent
    ).data;

    if (!getOpenAiApiKey()) {
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const session = await step.run("fetch-session", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("sessions")
        .select(
          "id, stream_id, name, seed_question, created_by, synthesis_document_id",
        )
        .eq("id", sessionId)
        .maybeSingle();
      if (error || !data) {
        throw new Error(error?.message ?? "Session not found");
      }
      return data;
    });

    const children = await step.run("fetch-children", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .select("id, title, type, content, summary")
        .eq("session_id", sessionId)
        .eq("is_draft", false)
        .neq("type", "Summary")
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(error.message);
      }
      return data ?? [];
    });

    const systemPrompt = await step.run("load-synthesize-prompt", async () =>
      loadSynthesizePrompt(streamId),
    );

    const markdown = await step.run("synthesize", async () =>
      synthesizeSessionMarkdown({
        sessionName: session.name,
        inquiry: session.seed_question,
        childBodies: children.map((c) => ({
          title: c.title?.trim() || "Untitled",
          type: c.type,
          summary: c.summary,
          content: c.content ?? "",
        })),
        systemPrompt,
      }),
    );

    const summaryDocId = await step.run("write-summary", async () => {
      const admin = createAdminClient();
      const title = `Summary · ${session.name}`;

      if (session.synthesis_document_id) {
        const { error } = await admin
          .from("documents")
          .update({
            content: markdown,
            summary: markdown,
            title,
            needs_review: false,
            is_draft: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.synthesis_document_id);
        if (error) throw new Error(error.message);
        return session.synthesis_document_id as string;
      }

      const { data, error } = await admin
        .from("documents")
        .insert({
          stream_id: streamId,
          created_by: session.created_by,
          content: markdown,
          summary: markdown,
          title,
          type: "Summary",
          session_id: sessionId,
          privacy_status: "public",
          tags: ["session-summary"],
          participants: [],
          needs_review: false,
          is_draft: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Could not create summary document");
      }

      await admin.from("document_sessions").upsert({
        document_id: data.id,
        session_id: sessionId,
      });

      await admin
        .from("sessions")
        .update({ synthesis_document_id: data.id })
        .eq("id", sessionId);

      return data.id as string;
    });

    await step.run("emit-document-created", async () => {
      await inngest.send({
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId: summaryDocId, streamId },
      });
    });

    return { ok: true, summaryDocId, childCount: children.length };
  },
);
