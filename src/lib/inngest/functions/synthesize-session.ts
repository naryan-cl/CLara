import OpenAI from "openai";
import {
  inngest,
  CLARA_SESSION_FINALIZED,
  CLARA_DOCUMENT_CREATED,
  type ClaraSessionFinalizedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";

const MAX_CONTENT_CHARS = 12_000;

async function synthesizeSessionMarkdown(input: {
  sessionName: string;
  inquiry: string | null;
  childBodies: { title: string; type: string | null; content: string }[];
}): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });
  const joined = input.childBodies
    .map(
      (c, i) =>
        `### Contribution ${i + 1}: ${c.title} (${c.type ?? "Document"})\n\n${c.content}`,
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CONTENT_CHARS);

  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content:
          "You write a clear Markdown summary for a CLara gathering (session). " +
          "Synthesize themes, tensions, and notable insights across the contributed " +
          "reflections/transcripts/notes. Use short headings and bullets. Do not invent " +
          "participants or quotes that are not grounded in the material. If material is " +
          "thin, say what little is present honestly.",
      },
      {
        role: "user",
        content:
          `Session name: ${input.sessionName}\n` +
          `Inquiry: ${input.inquiry ?? "(none)"}\n\n` +
          `Contributions:\n\n${joined || "(no submitted contributions yet)"}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned no synthesis content");
  }
  return text;
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
        .select("id, title, type, content")
        .eq("session_id", sessionId)
        .eq("is_draft", false)
        .neq("type", "Summary")
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(error.message);
      }
      return data ?? [];
    });

    const markdown = await step.run("synthesize", async () =>
      synthesizeSessionMarkdown({
        sessionName: session.name,
        inquiry: session.seed_question,
        childBodies: children.map((c) => ({
          title: c.title?.trim() || "Untitled",
          type: c.type,
          content: c.content ?? "",
        })),
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
