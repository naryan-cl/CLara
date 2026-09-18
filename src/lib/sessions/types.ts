import {
  parseHighlightColor,
  type SessionHighlightColor,
} from "@/lib/sessions/highlight";
import { parseReflectQuestions } from "@/lib/sessions/reflect-flow";

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
  highlight_color: SessionHighlightColor | null;
  /** Optional welcome for guided Reflect. */
  reflect_welcome: string | null;
  /** Ordered guided Reflect questions; empty = simple inquiry. */
  reflect_questions: string[];
};

export const SESSION_SELECT_NO_HIGHLIGHT =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token, join_code, finalized_at, synthesis_document_id, reflect_welcome, reflect_questions";

export const SESSION_SELECT = `${SESSION_SELECT_NO_HIGHLIGHT}, highlight_color`;

/** Pre-0021 select — used when join_code columns are not migrated yet. */
export const SESSION_SELECT_LEGACY =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token";

/** Pre-0040 select — no guided Reflect columns yet. */
export const SESSION_SELECT_NO_REFLECT_FLOW =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token, join_code, finalized_at, synthesis_document_id, highlight_color";

export const SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT =
  "id, stream_id, name, occurred_at, created_by, created_at, updated_at, seed_question, description, share_token, join_code, finalized_at, synthesis_document_id";

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
    highlight_color: parseHighlightColor(row.highlight_color),
    reflect_welcome:
      typeof row.reflect_welcome === "string" && row.reflect_welcome.trim()
        ? row.reflect_welcome.trim()
        : null,
    reflect_questions: parseReflectQuestions(row.reflect_questions),
  };
}

export type JoinMode = "reflect" | "record" | "upload";

/** Full alphanumeric alphabet for join codes (A–Z, 0–9). */
export const JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const JOIN_CODE_MIN_LENGTH = 4;
export const JOIN_CODE_MAX_LENGTH = 8;

/** Short share/QR path using the human join code (not the UUID share_token). */
export function joinPathForSession(
  joinCode: string,
  mode: JoinMode = "reflect",
): string {
  const code = normalizeJoinCode(joinCode);
  return `/join/${encodeURIComponent(code)}?mode=${mode}`;
}

/** True for a dashed UUID (session ids, share tokens, document ids). */
export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** True when a /join/[token] segment looks like a legacy share_token UUID. */
export function looksLikeShareToken(token: string): boolean {
  return looksLikeUuid(token);
}

/** 6-char uppercase alphanumeric join code. */
export function generateJoinCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Validate a host-chosen join code: 4–8 chars from A–Z / 0–9.
 * Returns normalized code or an error message.
 */
export function validateJoinCode(
  raw: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const code = normalizeJoinCode(raw);
  if (code.length < JOIN_CODE_MIN_LENGTH || code.length > JOIN_CODE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Join code must be ${JOIN_CODE_MIN_LENGTH}–${JOIN_CODE_MAX_LENGTH} characters.`,
    };
  }
  for (const ch of code) {
    if (!JOIN_CODE_ALPHABET.includes(ch)) {
      return {
        ok: false,
        error: "Use letters and numbers only (A–Z, 0–9).",
      };
    }
  }
  return { ok: true, code };
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

export function isMissingHighlightColorSchemaError(
  message: string | undefined,
): boolean {
  if (!message) return false;
  return message.includes("highlight_color");
}

export function isMissingReflectFlowSchemaError(
  message: string | undefined,
): boolean {
  if (!message) return false;
  return (
    message.includes("reflect_welcome") ||
    message.includes("reflect_questions")
  );
}

/** Next-best column list when a sessions select fails on a missing migration. */
export function sessionSelectFallback(
  message: string | undefined,
): string | null {
  if (isMissingReflectFlowSchemaError(message)) {
    if (isMissingHighlightColorSchemaError(message)) {
      return SESSION_SELECT_NO_REFLECT_FLOW_NO_HIGHLIGHT;
    }
    return SESSION_SELECT_NO_REFLECT_FLOW;
  }
  if (isMissingHighlightColorSchemaError(message)) {
    return SESSION_SELECT_NO_HIGHLIGHT;
  }
  if (isMissingJoinCodeSchemaError(message)) {
    return SESSION_SELECT_LEGACY;
  }
  return null;
}
