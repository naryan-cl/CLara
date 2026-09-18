import Link from "next/link";
import { joinWithGuestName } from "@/app/(public)/join/actions";
import { loginHref } from "@/lib/access/safe-next-path";
import type { JoinMode } from "@/lib/sessions/types";

type Props = {
  token: string;
  mode: JoinMode;
  sessionName: string;
  seedQuestion: string | null;
  reflectWelcome?: string | null;
  error: string | null;
};

export function JoinChooser({
  token,
  mode,
  sessionName,
  seedQuestion,
  reflectWelcome = null,
  error,
}: Props) {
  const returnPath = `/join/${encodeURIComponent(token)}?mode=${mode}`;
  const intro = reflectWelcome?.trim() || seedQuestion;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 py-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-horizon">
          Join session
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">
          {sessionName}
        </h1>
        {intro ? (
          <p className="mt-3 text-sm leading-6 text-ink/65">{intro}</p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-ink/65">
            Contribute with a guest name, or sign in with your account.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-paper px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <form
        action={joinWithGuestName}
        className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-5 shadow-soft"
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="mode" value={mode} />
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-sage">
            Guest name
          </span>
          <input
            name="displayName"
            type="text"
            required
            maxLength={80}
            autoComplete="nickname"
            placeholder="How should we show you?"
            className="rounded-md border border-cloud bg-sand px-3 py-2.5 text-sm text-ink outline-none focus:border-horizon"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-forest px-4 py-2.5 text-sm font-medium text-paper hover:bg-forest-deep"
        >
          Continue as guest
        </button>
        <p className="text-xs text-ink/50">
          No account needed. You can contribute to this gathering only — not the
          full Commons.
        </p>
      </form>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-ink/55">Already have an account?</p>
        <Link
          href={loginHref(returnPath)}
          className="text-sm font-medium text-horizon underline"
        >
          Log in to join
        </Link>
      </div>
    </div>
  );
}
