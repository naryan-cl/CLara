/**
 * Turn auth metadata + email into a human name.
 * Why: Google puts the name in a few different keys; email/password accounts
 * often have none — the local-part of the email is still better than "Member".
 */
export function displayNameFromParts(input: {
  email?: string | null;
  metadata?: Record<string, unknown> | null;
  fallback?: string;
}): string {
  const meta = input.metadata ?? {};
  const str = (key: string) => {
    const value = meta[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const givenFamily = [str("given_name"), str("family_name")]
    .filter(Boolean)
    .join(" ");
  const emailLocal = (input.email ?? "").split("@")[0]?.trim() ?? "";
  return (
    str("full_name") ||
    str("name") ||
    str("display_name") ||
    givenFamily ||
    emailLocal ||
    input.fallback ||
    "Member"
  );
}

export function avatarUrlFromMetadata(
  metadata?: Record<string, unknown> | null,
): string | null {
  const meta = metadata ?? {};
  for (const key of ["avatar_url", "picture"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
