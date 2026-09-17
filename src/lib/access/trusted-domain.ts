export const CL_EMAIL_DOMAIN = "cultivatingleadership.com";

export function emailDomain(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) return "";
  return trimmed.slice(at + 1);
}

export function isClEmail(email: string | null | undefined): boolean {
  return emailDomain(email) === CL_EMAIL_DOMAIN;
}
