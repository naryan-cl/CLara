import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";

export async function getDocumentById(
  id: string,
): Promise<{ document: CommonsDocument | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { document: null, error: error.message };
  }

  return { document: (data as CommonsDocument | null) ?? null, error: null };
}
