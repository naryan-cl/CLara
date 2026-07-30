import OpenAI from "openai";
import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  type ClaraDocumentCreatedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { findOrCreateSessionByName } from "@/lib/sessions/find-or-create-session";

/** Keep prompt cost/latency sane for the first slice — long docs get truncated. */
const MAX_CONTENT_CHARS = 8_000;

type OkfProposal = {
  tags: string[];
  participants: string[];
  sessionId: string | null;
  confident: boolean;
};

const OKF_SCHEMA = {
  type: "object",
  properties: {
    tags: { type: "array", items: { type: "string" } },
    participants: { type: "array", items: { type: "string" } },
    sessionId: { type: ["string", "null"] },
    confident: {
      type: "boolean",
      description:
        "true only if tags/participants/sessionId were extracted with reasonable confidence from the text itself, not guessed.",
    },
  },
  required: ["tags", "participants", "sessionId", "confident"],
  additionalProperties: false,
} as const;

async function proposeOkf(content: string): Promise<OkfProposal> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });
  const truncated = content.slice(0, MAX_CONTENT_CHARS);

  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content:
          "You extract OKF (Open Knowledge Format) metadata for CLara, a platform " +
          "for collective thinking at Cultivating Leadership. Given a Commons " +
          "document's Markdown content, propose: short topical tags (3-6 words " +
          "each, lowercase, no leading #), any named participants mentioned as " +
          "speakers/authors, and a short session identifier slug if the text " +
          "clearly references a specific session/event (otherwise null). Only " +
          "set confident=true if you found real signal in the text, not guesses.",
      },
      { role: "user", content: truncated },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "okf_enrichment",
        strict: true,
        schema: OKF_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned no content");
  }

  return JSON.parse(raw) as OkfProposal;
}

export const okfEnrichFn = inngest.createFunction(
  {
    id: "clara-okf-enrich",
    retries: 2,
    triggers: [{ event: CLARA_DOCUMENT_CREATED }],
  },
  async ({ event, step }) => {
    const { documentId } = (event as unknown as ClaraDocumentCreatedEvent).data;

    if (!getOpenAiApiKey()) {
      // Fail gracefully: no key configured yet is a config gap, not a bug —
      // don't retry-loop forever on every document.
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const doc = await step.run("fetch-document", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .select("id, stream_id, content, tags, participants, session_id")
        .eq("id", documentId)
        .maybeSingle();

      if (error) throw new Error(`fetch-document: ${error.message}`);
      if (!data) throw new Error(`fetch-document: ${documentId} not found`);
      return data;
    });

    const proposal = await step.run("propose-okf", async () => {
      try {
        return await proposeOkf(doc.content ?? "");
      } catch (err) {
        console.error("okf-enrich: proposeOkf failed", err);
        return null;
      }
    });

    const resolvedSessionId =
      !doc.session_id && proposal?.sessionId
        ? await step.run("resolve-session", async () => {
            const { sessionId } = await findOrCreateSessionByName(
              doc.stream_id,
              proposal.sessionId as string,
            );
            return sessionId;
          })
        : null;

    await step.run("apply-okf", async () => {
      const admin = createAdminClient();

      const existingTags = Array.isArray(doc.tags) ? doc.tags : [];
      const existingParticipants = Array.isArray(doc.participants)
        ? doc.participants
        : [];

      const patch: Record<string, unknown> = {
        needs_review: !proposal?.confident,
      };

      if (proposal) {
        if (existingTags.length === 0 && proposal.tags.length > 0) {
          patch.tags = proposal.tags;
        }
        if (
          existingParticipants.length === 0 &&
          proposal.participants.length > 0
        ) {
          patch.participants = proposal.participants;
        }
        if (resolvedSessionId) {
          patch.session_id = resolvedSessionId;
        }
      }

      const { error } = await admin
        .from("documents")
        .update(patch)
        .eq("id", documentId);

      if (error) throw new Error(`apply-okf: ${error.message}`);
    });

    return { ok: true, documentId, confident: proposal?.confident ?? false };
  },
);
