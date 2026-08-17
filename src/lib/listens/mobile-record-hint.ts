/**
 * First-time phone Record tip.
 *
 * Why localStorage: the wake-lock note is useful once, then it just crowds
 * the live capture strip. Storing “seen” on this browser means the dialog
 * does not come back every take (or after a refresh).
 */
const STORAGE_KEY = "clara.listens.mobile-record-hint-seen";

export function hasSeenMobileRecordHint(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markMobileRecordHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage — the dialog may show again next visit.
  }
}
