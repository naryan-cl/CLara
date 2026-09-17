const MAX_LENGTH = 500;

function pathOnly(value: string): string {
  return value.split("?")[0]?.split("#")[0] ?? value;
}

function isAllowedPath(path: string): boolean {
  if (path === "/dashboard" || path === "/waiting" || path === "/guide") {
    return true;
  }
  return (
    path.startsWith("/join/") ||
    path.startsWith("/add/") ||
    path.startsWith("/sessions/") ||
    path.startsWith("/commons") ||
    path.startsWith("/ask") ||
    path.startsWith("/map") ||
    path.startsWith("/admin") ||
    path.startsWith("/top10") ||
    path.startsWith("/common-ground") ||
    path.startsWith("/synthesis")
  );
}

/** Same-origin relative path only. Rejects protocol-relative and off-site URLs. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://") || value.includes("\\") || value.includes("\0")) {
    return null;
  }
  if (value.length > MAX_LENGTH) return null;

  const path = pathOnly(value);
  if (!isAllowedPath(path)) return "/dashboard";
  return value;
}

export function loginHref(nextPath: string | null): string {
  if (!nextPath) return "/login";
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
