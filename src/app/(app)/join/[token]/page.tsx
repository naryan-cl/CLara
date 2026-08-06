import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionByShareToken } from "@/lib/sessions/get-session-by-share-token";
import { markAttended } from "@/lib/sessions/attendance";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * Share/QR entry: resolve session by share_token, mark the visitor as a
 * participant, then open Reflect with that session pre-selected.
 */
export default async function JoinSessionPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { session, error } = await getSessionByShareToken(token);

  if (error || !session) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-medium text-ink">
          Session not found
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          This join link may be invalid, or you may not be a member of its
          stream.
        </p>
        <a
          href="/add/chat"
          className="mt-6 inline-block text-sm text-horizon underline"
        >
          Go to Reflect
        </a>
      </div>
    );
  }

  await markAttended(session.id, user.id);

  redirect(`/add/chat?session=${session.id}`);
}
