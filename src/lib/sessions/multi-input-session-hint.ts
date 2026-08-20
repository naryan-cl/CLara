/**
 * First-time Add → Session intro (multi-input vs single Add).
 *
 * Stored per browser so returning hosts are not blocked by the dialog.
 */
const STORAGE_KEY = "clara.session.multi-input-intro-seen";

export function hasSeenMultiInputSessionIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markMultiInputSessionIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode — dialog may reappear next visit.
  }
}
