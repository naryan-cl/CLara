"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";
type Status = "idle" | "working" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGoogle() {
    setStatus("working");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    }
    // On success, Supabase redirects the browser to Google — no local state change.
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setErrorMessage("");

    const supabase = createClient();
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error.message);
      return;
    }

    // Sign-up with "Confirm email" on may leave session null until they confirm.
    if (mode === "signup" && !result.data.session) {
      setStatus("error");
      setErrorMessage(
        "Account created. If email confirmation is required, check your inbox — or ask an admin to disable Confirm email in Supabase Auth.",
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStatus("idle");
    setErrorMessage("");
  }

  const busy = status === "working";

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-sand px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm rounded-lg border border-cloud bg-paper p-8 shadow-soft">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-sage">
          CLara Platform
        </p>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">
          {mode === "signin" ? "Login with CL Account" : "Create your account"}
        </h1>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-cloud bg-white px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-cloud" />
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-sage">
            or email
          </span>
          <div className="h-px flex-1 bg-cloud" />
        </div>

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium text-ink/70">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@cultivatingleadership.com"
            className="min-h-11 rounded-md border border-cloud bg-white px-3 py-3 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-glow/40"
          />

          <label htmlFor="password" className="text-sm font-medium text-ink/70">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="min-h-11 rounded-md border border-cloud bg-white px-3 py-3 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-glow/40"
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-paper shadow-soft transition-colors hover:bg-forest-deep disabled:opacity-60"
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>

          {status === "error" && (
            <p className="text-sm text-danger">{errorMessage}</p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-ink/60">
          {mode === "signin" ? (
            <>
              No password account yet?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-medium text-forest underline-offset-2 hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-medium text-forest underline-offset-2 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
