import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1";

function encryptionKey(): Buffer | null {
  const raw = process.env.ASK_LLM_CREDENTIALS_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function canEncryptAskCredentials(): boolean {
  return encryptionKey() !== null;
}

/** Returns null when ASK_LLM_CREDENTIALS_KEY is not configured. */
export function encryptAskApiKey(plaintext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptAskApiKey(ciphertext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;

  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;

  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const encrypted = Buffer.from(parts[3]!, "base64url");

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function keyHintFromPlaintext(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "****";
  return trimmed.slice(-4);
}
