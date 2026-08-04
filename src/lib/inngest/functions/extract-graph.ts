import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  type ClaraDocumentCreatedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey } from "@/lib/openai/env";
import { proposeGraph } from "@/lib/graph/extract-graph";
import { upsertGraph } from "@/lib/graph/upsert-graph";

export const extractGraphFn = inngest.createFunction(
  {
    id: "clara-extract-graph",
    retries: 2,
    triggers: [{ event: CLARA_DOCUMENT_CREATED }],
  },
  async ({ event, step }) => {
    const { documentId } = (event as unknown as ClaraDocumentCreatedEvent).data;

    if (!getOpenAiApiKey()) {
      // Same posture as okf-enrich/embed-document: a missing key is a
      // config gap, not a bug — don't retry-loop on every document.
      return { ok: false, skipped: "OPENAI_API_KEY not configured" };
    }

    const doc = await step.run("fetch-document", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("documents")
        .select("id, stream_id, content, privacy_status")
        .eq("id", documentId)
        .maybeSingle();

      if (error) throw new Error(`fetch-document: ${error.message}`);
      if (!data) throw new Error(`fetch-document: ${documentId} not found`);
      return data;
    });

    if (doc.privacy_status !== "public") {
      // The Knowledge Map has no per-node privacy field and no approval
      // gate — anything extracted is visible to the whole stream, so only
      // Public documents are ever a source. Private stays private.
      return { ok: false, skipped: "private document" };
    }

    if (!doc.content || !doc.content.trim()) {
      return { ok: false, skipped: "empty content" };
    }

    const proposal = await step.run("propose-graph", async () => {
      try {
        return await proposeGraph(doc.content);
      } catch (err) {
        console.error("extract-graph: proposeGraph failed", err);
        return null;
      }
    });

    if (!proposal || proposal.nodes.length === 0) {
      return { ok: true, documentId, nodeCount: 0, edgeCount: 0 };
    }

    const result = await step.run("upsert-graph", async () => {
      try {
        return await upsertGraph({
          streamId: doc.stream_id,
          documentId: doc.id,
          proposal,
        });
      } catch (err) {
        console.error("extract-graph: upsertGraph failed", err);
        return null;
      }
    });

    if (!result) {
      return { ok: false, skipped: "upsert failed, see logs" };
    }

    return { ok: true, documentId, ...result };
  },
);
