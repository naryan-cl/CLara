import { redirect } from "next/navigation";

/** Old Chat route — Add · Reflect now lives at `/add/chat`. */
export default function ChatRedirectPage() {
  redirect("/add/chat");
}
