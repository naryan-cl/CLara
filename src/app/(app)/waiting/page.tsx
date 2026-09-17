import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/get-access-context";

type Props = {
  searchParams?: Promise<{ session?: string; status?: string }>;
};

export default async function WaitingPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const access = await getAccessContext();

  if (access.kind === "member" || access.kind === "guest" || access.kind === "link_guest") {
    redirect("/dashboard");
  }

  const highlighted = params.session
    ? access.pendingRequests.find((r) => r.sessionId === params.session)
    : null;
  const status = params.status === "rejected" ? "rejected" : "pending";
  const requests = highlighted ? [highlighted] : access.pendingRequests;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-horizon">
          Access
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">
          {status === "rejected"
            ? "Access not approved yet"
            : "Waiting for approval"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Cultivating Leadership accounts join Camp CLAI automatically. Other
          domains get session-only access after a stream admin approves a join
          request — not the full Commons.
        </p>
      </div>

      {requests.length > 0 ? (
        <ul className="flex flex-col gap-3 rounded-lg border border-cloud bg-paper p-4 shadow-soft">
          {requests.map((request) => (
            <li key={request.sessionId} className="text-sm text-ink">
              <p className="font-medium">{request.sessionName}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-warning">
                Pending admin approval
              </p>
              <p className="mt-2 text-ink/55">
                Refresh this page after an admin approves you, or reopen the
                join link / QR you were given.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-cloud bg-paper p-4 shadow-soft">
          <p className="text-sm text-ink/70">
            You&apos;re signed in as{" "}
            <span className="font-medium text-ink">
              {access.userEmail ?? "your account"}
            </span>
            , but you don&apos;t have stream or session access yet.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/60">
            <li>Open a session join link / QR you were given, or</li>
            <li>
              Ask a Camp CLAI admin to add your email (full stream access) or
              approve a session guest request.
            </li>
          </ul>
        </div>
      )}

      <p className="text-sm text-ink/50">
        Keep this tab open during a live gathering — approval is usually quick.
      </p>
    </div>
  );
}
