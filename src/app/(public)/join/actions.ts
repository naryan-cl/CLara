"use server";

import { redirect } from "next/navigation";
import {
  joinAsLinkParticipant,
  setLinkGuestCookie,
  clearLinkGuestCookie,
} from "@/lib/access/link-guest";
import type { JoinMode } from "@/lib/sessions/types";

function addHref(mode: JoinMode, sessionId: string): string {
  if (mode === "record") return `/add/record?session=${sessionId}`;
  if (mode === "upload") return `/add/upload?session=${sessionId}`;
  return `/add/chat?session=${sessionId}`;
}

function resolveMode(raw: string | undefined): JoinMode {
  if (raw === "record" || raw === "upload" || raw === "reflect") return raw;
  return "reflect";
}

export async function joinWithGuestName(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const mode = resolveMode(String(formData.get("mode") ?? "") || undefined);

  if (!token) {
    redirect("/join/invalid");
  }

  const result = await joinAsLinkParticipant({
    token,
    displayName,
    joinMode: mode,
  });

  if (!result.ok) {
    redirect(
      `/join/${encodeURIComponent(token)}?mode=${mode}&error=${encodeURIComponent(result.error)}`,
    );
  }

  await setLinkGuestCookie(result.deviceToken);
  redirect(addHref(mode, result.sessionId));
}

export async function leaveLinkGuestSession(): Promise<void> {
  await clearLinkGuestCookie();
  redirect("/login");
}
