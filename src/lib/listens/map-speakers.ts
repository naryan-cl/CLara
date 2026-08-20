import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import {
  applySpeakerNameMap,
  attributeAllSpeakers,
  listSpeakerLabels,
} from "@/lib/listens/format-transcript";

const MAP_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          name: { type: "string" },
        },
        required: ["label", "name"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
} as const;

/**
 * Rename diarized Speaker A/B headers to session participant display names.
 * Fail-open: on any error, returns the original markdown unchanged.
 */
export async function mapTranscriptSpeakersToNames(
  markdown: string,
  participantNames: string[],
): Promise<string> {
  const names = participantNames.map((n) => n.trim()).filter(Boolean);
  if (!markdown.trim() || names.length === 0) return markdown;

  const labels = listSpeakerLabels(markdown);

  if (names.length === 1) {
    // Solo memo: one listed person + at most one voice. Do not collapse
    // Speaker A/B/C onto the uploader when diarize heard a conversation.
    return attributeAllSpeakers(markdown, names[0]);
  }

  if (labels.length === 0) {
    // No speaker headers — leave timestamps; names live in OKF participants.
    return markdown;
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return markdown;
  }

  try {
    const client = new OpenAI({ apiKey });
    // Keep prompt small: labels + name list + a short sample of the transcript.
    const sample = markdown.slice(0, 6_000);
    const completion = await client.chat.completions.create({
      model: getOpenAiChatModel(),
      messages: [
        {
          role: "system",
          content:
            "You map anonymous transcript speaker labels to real participant " +
            "display names. Only use names from the provided knownParticipants " +
            "list. If you are unsure about a label, set name equal to that " +
            "label. Never invent names. Prefer first-appearance order when " +
            "dialogue gives no cue: first new label → first unused name.",
        },
        {
          role: "user",
          content: JSON.stringify({
            speakerLabels: labels,
            knownParticipants: names,
            transcriptSample: sample,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "speaker_name_map",
          strict: true,
          schema: MAP_SCHEMA,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return markdown;

    const parsed = JSON.parse(raw) as {
      assignments?: Array<{ label?: string; name?: string }>;
    };
    const allowed = new Set(names.map((n) => n.toLowerCase()));
    const labelSet = new Set(labels);
    const safe: Record<string, string> = {};
    for (const row of parsed.assignments ?? []) {
      const label = (row.label ?? "").trim();
      const proposed = (row.name ?? "").trim();
      if (!label || !proposed) continue;
      if (!labelSet.has(label)) continue;
      if (proposed === label) continue;
      if (!allowed.has(proposed.toLowerCase())) continue;
      safe[label] = proposed;
    }
    return applySpeakerNameMap(markdown, safe);
  } catch (err) {
    console.error("mapTranscriptSpeakersToNames failed:", err);
    return markdown;
  }
}
