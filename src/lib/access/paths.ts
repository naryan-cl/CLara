function pathOnly(pathname: string): string {
  return pathname.split("?")[0]?.split("#")[0] ?? pathname;
}

export function isPendingAllowedPath(pathname: string): boolean {
  const path = pathOnly(pathname);
  return (
    path === "/waiting" ||
    path === "/guide" ||
    path.startsWith("/join/")
  );
}

export function isGuestAllowedPath(pathname: string): boolean {
  const path = pathOnly(pathname);
  if (isPendingAllowedPath(path)) return true;
  if (path === "/dashboard") return true;
  if (path.startsWith("/add/chat")) return true;
  if (path.startsWith("/add/record")) return true;
  if (path.startsWith("/add/upload")) return true;
  if (path.startsWith("/sessions/archive/")) return true;
  if (path.startsWith("/sessions/documents/")) return true;
  return false;
}

/** Named join-link guests (no account): same paths as auth session guests. */
export function isLinkGuestAllowedPath(pathname: string): boolean {
  return isGuestAllowedPath(pathname);
}
