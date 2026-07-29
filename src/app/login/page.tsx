"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-sand px-6">
      <div className="w-full max-w-sm rounded-lg border border-cloud bg-paper p-8 shadow-soft">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-sage">
          CLara Platform
        </p>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">
          Login with CL Account
        </h1>

        {status === "sent" ? (
          <p className="mt-6 text-sm leading-6 text-ink/70">
            Check <span className="font-medium text-ink">{email}</span> for a
            sign-in link. Click it on this device to finish logging in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label htmlFor="email" className="text-sm font-medium text-ink/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cultivatingleadership.com"
              className="rounded-md border border-cloud bg-white px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-glow/40"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="mt-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-paper shadow-soft transition-colors hover:bg-forest-deep disabled:opacity-60"
            >
              {status === "sending" ? "Sending link…" : "Send magic link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-danger">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
