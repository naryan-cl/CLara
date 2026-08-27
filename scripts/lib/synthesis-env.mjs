/**
 * Shared helpers for offline Preliminary Synthesis export / retrieval.
 * Never logs secret values. Prefer SUPABASE_SECRET_KEY (Camp-CLAI convention).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(__dirname, "../..");

export function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).replace(/^\uFEFF/, "");
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function getSupabaseConfig() {
  loadEnvLocal();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      null,
    serviceKey:
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      null,
  };
}

export async function createSynthesisClient() {
  const { url, anonKey, serviceKey } = getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example → .env.local or run: npx vercel env pull .env.local",
    );
  }

  if (serviceKey) {
    return {
      supabase: createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      mode: "service_role",
    };
  }

  if (!anonKey) {
    throw new Error(
      "Need SUPABASE_SECRET_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY + SYNTHESIS_EXPORT_EMAIL/PASSWORD",
    );
  }

  const supabase = createClient(url, anonKey);
  const email = process.env.SYNTHESIS_EXPORT_EMAIL?.trim();
  const password = process.env.SYNTHESIS_EXPORT_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      "No SUPABASE_SECRET_KEY. Set SYNTHESIS_EXPORT_EMAIL and SYNTHESIS_EXPORT_PASSWORD for authenticated export.",
    );
  }

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.session) {
    throw new Error(`Auth failed: ${signInError?.message ?? "no session"}`);
  }

  return { supabase, mode: "authenticated" };
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}
