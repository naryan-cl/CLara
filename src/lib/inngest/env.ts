/** Read Inngest env at runtime (avoids Next.js baking empty values at build time). */
export function getInngestSigningKey(): string | undefined {
  const value = process.env.INNGEST_SIGNING_KEY?.trim();
  return value || undefined;
}

export function getInngestEventKey(): string | undefined {
  const value = process.env.INNGEST_EVENT_KEY?.trim();
  return value || undefined;
}

export function getInngestServeOrigin(): string | undefined {
  const value =
    process.env.INNGEST_SERVE_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  return value || undefined;
}

export function getInngestEnvStatus() {
  return {
    hasSigningKey: Boolean(getInngestSigningKey()),
    hasEventKey: Boolean(getInngestEventKey()),
    serveOrigin: getInngestServeOrigin() ?? null,
  };
}
