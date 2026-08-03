import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  type ClaraDocumentCreatedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey } from "@/lib/openai/env";
import { storeDocumentEmbeddings } from "@/lib/embeddings/store-document-embeddings";

export const embedDocumentFn = inngest.createFunction(
  {
    id: "clara-embed-document",
    retries: 2,
    triggers: [{ event: CLARA_DOCUMENT_CREATED }],
  },
  async ({ event, step }) => {
    const { documentId } = (event as unknown as ClaraDocumentCreatedEvent).data;

    if (!getOpenAiApiKey()) {
      // Same posture as okf-enrich: a missing key is a config gap, not a bug
      // — don't retry-loop on every document.
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const doc = await step.run("fetch-document", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .select("id, stream_id, content")
        .eq("id", documentId)
        .maybeSingle();

      if (error) throw new Error(`fetch-document: ${error.message}`);
      if (!data) throw new Error(`fetch-document: ${documentId} not found`);
      return data;
    });

    if (!doc.content || !doc.content.trim()) {
      // e.g. a PDF/DOCX conversion placeholder that hasn't landed content
      // yet — convert-upload re-fires this event once real content exists.
      return { ok: false, skipped: "empty content" };
    }

    const result = await step.run("embed-and-store", async () => {
      try {
        return await storeDocumentEmbeddings({
          documentId: doc.id,
          streamId: doc.stream_id,
          content: doc.content,
        });
      } catch (err) {
        console.error("embed-document: storeDocumentEmbeddings failed", err);
        return null;
      }
    });

    if (!result) {
      return { ok: false, skipped: "embedding failed, see logs" };
    }

    return { ok: true, documentId, chunkCount: result.chunkCount };
  },
);
