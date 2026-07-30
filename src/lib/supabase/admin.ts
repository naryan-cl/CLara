import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged, backend-only Supabase client (bypasses RLS via the Secret API
 * key). Use ONLY from trusted server contexts with no end-user request
 * attached — e.g. Inngest functions. Never import this from a route handler
 * or Server Component that serves a browser request; use
 * `@/lib/supabase/server` there instead so RLS stays in effect.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for admin client.",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
