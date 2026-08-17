"use client";

import { useEffect, useState } from "react";

/**
 * Matches Tailwind `sm` (640px). Below that we treat the UI as phone.
 * Use this in event handlers / exclusive-panel logic; prefer `max-sm:` CSS
 * for layout so the first paint does not flash a desktop panel.
 */
export const PHONE_MQ = "(max-width: 639px)";

export function isPhoneViewport(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(PHONE_MQ).matches
  );
}

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    function apply() {
      setIsPhone(mq.matches);
    }
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return isPhone;
}
