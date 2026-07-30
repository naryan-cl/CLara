import {
  inngest,
  CLARA_UPLOAD_RECEIVED,
  CLARA_DOCUMENT_CREATED,
  type ClaraUploadReceivedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { htmlToMarkdown } from "@/lib/markdown/convert";

const FAILURE_PLACEHOLDER =
  "_Automatic text extraction failed for this file. Edit this document to " +
  "add the content manually, or ask an admin for help._";

async function convertPdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });
  return text.trim();
}

async function convertDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return htmlToMarkdown(html);
}

export const convertUploadFn = inngest.createFunction(
  {
    id: "clara-convert-upload",
    retries: 2,
    triggers: [{ event: CLARA_UPLOAD_RECEIVED }],
  },
  async ({ event, step }) => {
    const { documentId, streamId, storagePath, fileType } = (
      event as unknown as ClaraUploadReceivedEvent
    ).data;

    const markdown = await step.run("download-and-convert", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("receives-staging")
        .download(storagePath);

      if (error) throw new Error(`download: ${error.message}`);

      const buffer = Buffer.from(await data.arrayBuffer());

      try {
        return fileType === "pdf"
          ? await convertPdf(buffer)
          : await convertDocx(buffer);
      } catch (err) {
        console.error("convert-upload: conversion failed", err);
        return null;
      }
    });

    await step.run("apply-conversion", async () => {
      const admin = createAdminClient();
      const success = Boolean(markdown && markdown.trim());

      const { error } = await admin
        .from("documents")
        .update({
          content: success ? markdown : FAILURE_PLACEHOLDER,
          needs_review: !success,
        })
        .eq("id", documentId);

      if (error) throw new Error(`apply-conversion: ${error.message}`);
    });

    await step.run("cleanup-storage", async () => {
      const admin = createAdminClient();
      const { error } = await admin.storage
        .from("receives-staging")
        .remove([storagePath]);
      if (error) {
        // Non-fatal — the document already has its content either way.
        console.error("convert-upload: storage cleanup failed", error);
      }
    });

    if (markdown && markdown.trim()) {
      await step.sendEvent("trigger-okf-enrich", {
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId, streamId },
      });
    }

    return { ok: true, documentId, converted: Boolean(markdown) };
  },
);
