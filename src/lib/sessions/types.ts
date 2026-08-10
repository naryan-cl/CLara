export type SessionSummary = {
  id: string;
  stream_id: string;
  name: string;
  occurred_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  seed_question: string | null;
  description: string | null;
  share_token: string;
  join_code: string;
  finalized_at: string | null;
  synthesis_document_id: string | null;
};

export const SESSION_SELECT =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token, join_code, finalized_at, synthesis_document_id";

/** Pre-0021 select — used when join_code columns are not migrated yet. */
export const SESSION_SELECT_LEGACY =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token";

export function coerceSession(row: Record<string, unknown>): SessionSummary {
  const shareToken = String(row.share_token ?? "");
  const joinCode =
    typeof row.join_code === "string" && row.join_code.length > 0
      ? row.join_code
      : shareToken.replace(/-/g, "").slice(0, 6).toUpperCase() || "LEGACY";

  return {
    id: String(row.id),
    stream_id: String(row.stream_id),
    name: String(row.name),
    occurred_at: (row.occurred_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    seed_question: (row.seed_question as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    share_token: shareToken,
    join_code: joinCode,
    finalized_at: (row.finalized_at as string | null) ?? null,
    synthesis_document_id:
      (row.synthesis_document_id as string | null) ?? null,
  };
}

export type JoinMode = "reflect" | "record" | "upload";

export function joinPathForSession(
  shareToken: string,
  mode: JoinMode = "reflect",
): string {
  return `/join/${shareToken}?mode=${mode}`;
}

/** 6-char uppercase alphanumeric join code (no ambiguous 0/O/1/I). */
export function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isMissingJoinCodeSchemaError(
  message: string | undefined,
): boolean {
  if (!message) return false;
  return (
    message.includes("join_code") ||
    message.includes("finalized_at") ||
    message.includes("synthesis_document_id") ||
    message.includes("schema cache")
  );
}
