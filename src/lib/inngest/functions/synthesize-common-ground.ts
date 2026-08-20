import OpenAI from "openai";
import {
  inngest,
  CLARA_COMMON_GROUND_REQUESTED,
  CLARA_DOCUMENT_CREATED,
  type ClaraCommonGroundRequestedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { DEFAULT_COMMON_GROUND_SYSTEM_PROMPT } from "@/lib/prompts/defaults";
import {
  appendTruncationNote,
  truncateWithFlag,
} from "@/lib/synthesis/truncation-note";

const MAX_INPUT_CHARS = 24_000;

type SessionBundle = {
  name: string;
  inquiry: string | null;
  synthesis: string | null;
  contributions: { title: string; type: string | null; body: string }[];
};

function contributionBody(summary: string | null, content: string): string {
  const brief = summary?.trim();
  if (brief) return brief;
  return content.trim();
}

async function synthesizeCommonGroundMarkdown(input: {
  title: string;
  sessions: SessionBundle[];
}): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });
  const rawJoined = input.sessions
    .map((session, index) => {
      const contribBlocks = session.contributions
        .map(
          (c, i) =>
            `#### Contribution ${i + 1}: ${c.title} (${c.type ?? "Document"})\n\n${c.body}`,
        )
        .join("\n\n");
      const synthesisBlock = session.synthesis
        ? `### Gathering synthesis\n\n${session.synthesis}\n\n`
        : "";
      return (
        `## Session ${index + 1}: ${session.name}\n` +
        `Inquiry: ${session.inquiry ?? "(none)"}\n\n` +
        synthesisBlock +
        (contribBlocks ? `### Contributions\n\n${contribBlocks}` : "(no contributions)")
      );
    })
    .join("\n\n---\n\n");

  const { text: joined, wasTruncated } = truncateWithFlag(
    rawJoined,
    MAX_INPUT_CHARS,
  );

  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      { role: "system", content: DEFAULT_COMMON_GROUND_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Report title: ${input.title}\n\n` +
          `Gatherings to synthesize:\n\n${joined || "(no session material)"}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned no common-ground content");
  }
  return appendTruncationNote(text, wasTruncated);
}

export const synthesizeCommonGroundFn = inngest.createFunction(
  {
    id: "clara-synthesize-common-ground",
    retries: 2,
    triggers: [{ event: CLARA_COMMON_GROUND_REQUESTED }],
  },
  async ({ event, step }) => {
    const { streamId, sessionIds, createdBy, title } = (
      event as unknown as ClaraCommonGroundRequestedEvent
    ).data;

    if (!getOpenAiApiKey()) {
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const sessions = await step.run("fetch-sessions", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("sessions")
        .select("id, name, seed_question, synthesis_document_id")
        .eq("stream_id", streamId)
        .in("id", sessionIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    const bundles: SessionBundle[] = [];

    for (const session of sessions) {
      const children = await step.run(`fetch-children-${session.id}`, async () => {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from("documents")
          .select("id, title, type, content, summary")
          .eq("session_id", session.id)
          .eq("is_draft", false)
          .neq("type", "Summary")
          .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return data ?? [];
      });

      let synthesis: string | null = null;
      if (session.synthesis_document_id) {
        const synthDoc = await step.run(`fetch-synthesis-${session.id}`, async () => {
          const admin = createAdminClient();
          const { data } = await admin
            .from("documents")
            .select("content")
            .eq("id", session.synthesis_document_id)
            .maybeSingle();
          return data?.content?.trim() ?? null;
        });
        synthesis = synthDoc;
      }

      bundles.push({
        name: session.name,
        inquiry: session.seed_question,
        synthesis,
        contributions: children.map((c) => ({
          title: c.title?.trim() || "Untitled",
          type: c.type,
          body: contributionBody(c.summary, c.content ?? ""),
        })),
      });
    }

    const markdown = await step.run("synthesize", async () =>
      synthesizeCommonGroundMarkdown({ title, sessions: bundles }),
    );

    const summaryDocId = await step.run("write-report", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .insert({
          stream_id: streamId,
          created_by: createdBy,
          content: markdown,
          summary: markdown,
          title,
          type: "Summary",
          session_id: null,
          privacy_status: "public",
          tags: ["common-ground", "cross-session"],
          participants: [],
          needs_review: false,
          is_draft: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Could not create common-ground report");
      }
      return data.id as string;
    });

    await step.run("emit-document-created", async () => {
      await inngest.send({
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId: summaryDocId, streamId },
      });
    });

    return { ok: true, summaryDocId, sessionCount: sessions.length };
  },
);
