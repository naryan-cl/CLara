/**
 * Screen Wake Lock helpers for Record.
 *
 * Why: a web page cannot keep the microphone alive once the phone sleeps or
 * the browser is backgrounded. Asking the browser to keep the *screen* on
 * while Record is in front is the supported alternative (Chrome Android,
 * Safari 16.4+). It does not survive the lock button or switching apps.
 */

export function isScreenWakeLockSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator &&
    typeof navigator.wakeLock?.request === "function"
  );
}

export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  if (!isScreenWakeLockSupported()) return null;
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    // NotAllowedError (battery saver, no user gesture) or a transient deny.
    return null;
  }
}
