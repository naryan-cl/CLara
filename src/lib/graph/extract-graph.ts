import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import type { GraphProposal } from "./types";

/** Keep prompt cost/latency sane, same posture as okf-enrich.ts. */
const MAX_CONTENT_CHARS = 8_000;
const MAX_ENTITIES = 6;

const GRAPH_SCHEMA = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      maxItems: MAX_ENTITIES,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["Atom", "Concept", "Framework", "Theme"],
          },
          label: { type: "string" },
          description: { type: "string" },
        },
        required: ["type", "label", "description"],
        additionalProperties: false,
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceLabel: { type: "string" },
          targetLabel: { type: "string" },
          relationship: { type: "string" },
        },
        required: ["sourceLabel", "targetLabel", "relationship"],
        additionalProperties: false,
      },
    },
  },
  required: ["nodes", "edges"],
  additionalProperties: false,
} as const;

/**
 * Ask an LLM to propose Knowledge Map entities + relationships for one
 * document's content. Mirrors okf-enrich.ts's proposeOkf shape (same model,
 * same structured-output/truncation posture).
 */
export async function proposeGraph(content: string): Promise<GraphProposal> {
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
          "You build a Knowledge Map for CLara, a platform for collective " +
          "thinking at Cultivating Leadership. Given a Commons document's " +
          `Markdown content, propose at most ${MAX_ENTITIES} distinct ` +
          "entities worth putting on the map: an Atom (a single raw " +
          "observation/quote/data point), a Concept (a named idea), a " +
          "Framework (a named model/method), or a Theme (a recurring " +
          "topic). Give each a short label (2-5 words) and a one-sentence " +
          "description. Then propose relationships between entities you " +
          "just listed, referencing them by their exact label, with a " +
          "short relationship phrase (e.g. 'supports', 'is an example " +
          "of', 'contrasts with'). Only include entities with real " +
          "signal in the text — if the document has nothing worth " +
          "mapping, return empty arrays.",
      },
      { role: "user", content: truncated },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "graph_extraction",
        strict: true,
        schema: GRAPH_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned no content");
  }

  return JSON.parse(raw) as GraphProposal;
}
