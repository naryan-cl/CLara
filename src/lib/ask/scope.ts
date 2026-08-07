/**
 * Optional grounding scope for Ask CLara — limit RAG to one Commons
 * document or every document linked to one session.
 */
export type AskScope = {
  documentId?: string;
  sessionId?: string;
  /** Human label for the UI banner ("Morning circle", doc title, …). */
  label: string;
};

export function askScopeIsActive(scope: AskScope | null | undefined): boolean {
  return Boolean(scope?.documentId || scope?.sessionId);
}
