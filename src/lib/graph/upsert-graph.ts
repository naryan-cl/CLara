import { createAdminClient } from "@/lib/supabase/admin";
import type { GraphProposal } from "./types";

export type UpsertGraphInput = {
  streamId: string;
  documentId: string;
  proposal: GraphProposal;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Backend-only (admin client): write one document's proposed Knowledge Map
 * nodes/edges. `nodes` is deduped per stream on lower(label) via a DB
 * expression unique index (0010), which postgrest's upsert() can't target
 * directly, so this does a manual find-or-insert instead — same intent as
 * findOrCreateSessionByName, just without a plain-column unique constraint
 * to hand to onConflict. Never clobbers an existing node's description;
 * only fills it in if it was previously null (same non-destructive posture
 * as okf-enrich's tag/participant merge).
 */
export async function upsertGraph(
  input: UpsertGraphInput,
): Promise<{ nodeCount: number; edgeCount: number }> {
  const admin = createAdminClient();
  const { streamId, documentId, proposal } = input;

  const labelToId = new Map<string, string>();

  for (const node of proposal.nodes) {
    const label = node.label.trim();
    if (!label) continue;

    const { data: existing, error: selectError } = await admin
      .from("nodes")
      .select("id, description")
      .eq("stream_id", streamId)
      .ilike("label", label)
      .maybeSingle();

    if (selectError) {
      throw new Error(`upsert-graph select node: ${selectError.message}`);
    }

    if (existing) {
      labelToId.set(label.toLowerCase(), existing.id as string);
      if (!existing.description && node.description) {
        const { error: updateError } = await admin
          .from("nodes")
          .update({ description: node.description })
          .eq("id", existing.id);
        if (updateError) {
          throw new Error(`upsert-graph update node: ${updateError.message}`);
        }
      }
      continue;
    }

    const { data: inserted, error: insertError } = await admin
      .from("nodes")
      .insert({
        stream_id: streamId,
        type: node.type,
        label,
        description: node.description || null,
        source_document_id: documentId,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        // Lost a race with a concurrent extraction job for the same label
        // — fall back to reading the row it created instead of failing.
        const { data: raced, error: racedError } = await admin
          .from("nodes")
          .select("id")
          .eq("stream_id", streamId)
          .ilike("label", label)
          .maybeSingle();
        if (racedError || !raced) {
          throw new Error(
            `upsert-graph insert node race: ${racedError?.message ?? "not found"}`,
          );
        }
        labelToId.set(label.toLowerCase(), raced.id as string);
        continue;
      }
      throw new Error(`upsert-graph insert node: ${insertError.message}`);
    }

    labelToId.set(label.toLowerCase(), inserted.id as string);
  }

  let edgeCount = 0;
  for (const edge of proposal.edges) {
    const sourceId = labelToId.get(edge.sourceLabel.trim().toLowerCase());
    const targetId = labelToId.get(edge.targetLabel.trim().toLowerCase());
    if (!sourceId || !targetId || sourceId === targetId) {
      // Endpoint didn't resolve to a node we just wrote, or is a self-loop
      // — skip rather than throw, this is best-effort enrichment.
      continue;
    }

    const { error: edgeError } = await admin.from("edges").upsert(
      {
        stream_id: streamId,
        source_node_id: sourceId,
        target_node_id: targetId,
        relationship: edge.relationship || null,
        source_document_id: documentId,
      },
      { onConflict: "stream_id,source_node_id,target_node_id" },
    );

    if (edgeError) {
      console.error("upsert-graph: edge upsert failed", edgeError);
      continue;
    }
    edgeCount += 1;
  }

  return { nodeCount: labelToId.size, edgeCount };
}
