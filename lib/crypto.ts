import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const raw = Buffer.from(env.tokenEncKey, "hex");
  if (raw.length !== 32) {
    throw new Error(
      "TOKEN_ENC_KEY must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32",
    );
  }
  return raw;
}

/**
 * Encrypts a long-lived Instagram access token for storage.
 *
 * The token grants full comment- and message-management access to the
 * connected account, so it never touches the database in plaintext.
 * Output format: iv.authTag.ciphertext, all base64url.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value.");
  }
  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
